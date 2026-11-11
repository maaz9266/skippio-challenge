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

describe("GET /orders/:orderId", () => {
  let store: MemoryStore;

  beforeEach(() => {
    store = new MemoryStore();
  });

  it("returns order details including payment and POS state", async () => {
    const app = createApp(store);
    await request(app).post("/payment-events").send(validEvent);

    const response = await request(app).get("/orders/ord_001");

    expect(response.status).toBe(200);
    expect(response.body.order).toMatchObject({
      id: "ord_001",
      venueId: "venue_001",
      currency: "EUR",
      total: 2650,
      paymentStatus: "paid",
      posStatus: "failed",
      posAttemptCount: 1,
      refundStatus: "none",
    });
    expect(response.body.order.items).toEqual(validEvent.order.items);
  });

  it("returns 404 for an unknown order", async () => {
    const app = createApp(store);
    const response = await request(app).get("/orders/missing");
    expect(response.status).toBe(404);
  });
});

describe("POST /orders/:orderId/sync", () => {
  let store: MemoryStore;

  beforeEach(() => {
    store = new MemoryStore();
  });

  it("retries failed synchronisation successfully", async () => {
    const app = createApp(store);
    await request(app).post("/payment-events").send(validEvent);

    const response = await request(app).post("/orders/ord_001/sync");

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.order).toMatchObject({
      paymentStatus: "paid",
      posStatus: "synced",
      posAttemptCount: 2,
      posTransactionRef: "pos_tx_ord_001_2",
    });
    expect(store.posTransactions.size).toBe(1);
  });

  it("does not create another transaction after success", async () => {
    const app = createApp(store);
    await request(app).post("/payment-events").send(validEvent);
    await request(app).post("/orders/ord_001/sync");

    const again = await request(app).post("/orders/ord_001/sync");

    expect(again.status).toBe(200);
    expect(again.body.order.posAttemptCount).toBe(2);
    expect(store.posTransactions.size).toBe(1);
  });

  it("handles overlapping retries without duplicate transactions", async () => {
    const app = createApp(store);
    await request(app).post("/payment-events").send(validEvent);

    const [first, second] = await Promise.all([
      request(app).post("/orders/ord_001/sync?delayMs=80"),
      request(app).post("/orders/ord_001/sync?delayMs=80"),
    ]);

    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([200, 409]);
    expect(store.posTransactions.size).toBe(1);

    const lookup = await request(app).get("/orders/ord_001");
    expect(lookup.body.order.posStatus).toBe("synced");
    expect(lookup.body.order.paymentStatus).toBe("paid");
  });

  it("returns 404 when syncing an unknown order", async () => {
    const app = createApp(store);
    const response = await request(app).post("/orders/missing/sync");
    expect(response.status).toBe(404);
  });
});
