import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { MemoryStore } from "../src/store/memoryStore.js";

const validEvent = {
  eventId: "evt_001",
  type: "payment.succeeded",
  order: {
    id: "ord_001",
    venueId: "venue_001",
    currency: "EUR",
    items: [
      { productId: "burger", quantity: 2, price: 1200 },
      { productId: "water", quantity: 1, price: 250 },
    ],
    total: 2650,
  },
};

const createSyncedOrder = async (store: MemoryStore) => {
  const app = createApp(store);
  await request(app).post("/payment-events").send(validEvent);
  await request(app).post("/orders/ord_001/sync");
  return app;
};

describe("POST /orders/:orderId/refund", () => {
  let store: MemoryStore;

  beforeEach(() => {
    store = new MemoryStore();
  });

  it("fully refunds an eligible paid+synced order", async () => {
    const app = await createSyncedOrder(store);

    const response = await request(app).post("/orders/ord_001/refund");

    expect(response.status).toBe(200);
    expect(response.body.order).toMatchObject({
      paymentStatus: "refunded",
      refundStatus: "refunded",
      refundedAmount: 2650,
      posStatus: "synced",
      total: 2650,
    });

    const lookup = await request(app).get("/orders/ord_001");
    expect(lookup.body.order.refundedAmount).toBe(2650);
    expect(lookup.body.order.refundStatus).toBe("refunded");
  });

  it("rejects unknown orders", async () => {
    const app = createApp(store);
    const response = await request(app).post("/orders/missing/refund");
    expect(response.status).toBe(404);
  });

  it("rejects ineligible orders that are not POS-synced", async () => {
    const app = createApp(store);
    await request(app).post("/payment-events").send(validEvent);

    const response = await request(app).post("/orders/ord_001/refund");

    expect(response.status).toBe(400);
    expect(store.getOrder("ord_001")?.refundStatus).toBe("none");
    expect(store.getOrder("ord_001")?.paymentStatus).toBe("paid");
  });

  it("does not refund twice on repeated requests", async () => {
    const app = await createSyncedOrder(store);
    await request(app).post("/orders/ord_001/refund");

    const again = await request(app).post("/orders/ord_001/refund");

    expect(again.status).toBe(409);
    expect(store.getOrder("ord_001")?.refundedAmount).toBe(2650);
  });

  it("does not refund twice under concurrent requests", async () => {
    const app = await createSyncedOrder(store);

    const [a, b] = await Promise.all([
      request(app).post("/orders/ord_001/refund"),
      request(app).post("/orders/ord_001/refund"),
    ]);

    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 409]);
    expect(store.getOrder("ord_001")?.refundStatus).toBe("refunded");
    expect(store.getOrder("ord_001")?.refundedAmount).toBe(2650);
  });

  it("preserves refunded status when a payment event is replayed", async () => {
    const app = await createSyncedOrder(store);
    await request(app).post("/orders/ord_001/refund");

    const replay = await request(app).post("/payment-events").send(validEvent);

    expect(replay.status).toBe(200);
    expect(replay.body.order).toMatchObject({
      paymentStatus: "refunded",
      refundStatus: "refunded",
      refundedAmount: 2650,
      posStatus: "synced",
    });
    expect(store.posTransactions.size).toBe(1);
  });
});
