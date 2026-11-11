import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { MemoryStore } from "../src/store/memoryStore.js";

describe("GET /debug/store", () => {
  let store: MemoryStore;

  beforeEach(() => {
    store = new MemoryStore();
  });

  it("exposes in-memory orders, event ids, and POS transactions", async () => {
    const app = createApp(store);

    await request(app)
      .post("/payment-events")
      .send({
        eventId: "evt_001",
        type: "payment.succeeded",
        order: {
          id: "ord_001",
          venueId: "venue_001",
          currency: "EUR",
          items: [{ productId: "burger", quantity: 1, price: 1000 }],
          total: 1000,
        },
      });

    const response = await request(app).get("/debug/store");

    expect(response.status).toBe(200);
    expect(response.body.counts).toEqual({
      orders: 1,
      processedEventIds: 1,
      posTransactions: 0,
    });
    expect(response.body.orders.ord_001.paymentStatus).toBe("paid");
    expect(response.body.processedEventIds.evt_001).toBe("ord_001");
  });

  it("can reset the store", async () => {
    const app = createApp(store);
    store.saveOrder({
      id: "ord_x",
      venueId: "v",
      currency: "EUR",
      items: [{ productId: "a", quantity: 1, price: 1 }],
      total: 1,
      paymentStatus: "paid",
      posStatus: "pending",
      posAttemptCount: 0,
      refundStatus: "none",
    });

    const reset = await request(app).post("/debug/store/reset");
    const dump = await request(app).get("/debug/store");

    expect(reset.status).toBe(200);
    expect(dump.body.counts.orders).toBe(0);
  });
});
