import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { MemoryStore } from "../src/store/memoryStore.js";
import { syncOrderToPos } from "../src/services/posSyncService.js";

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

describe("payment event duplicates and conflicts", () => {
  let store: MemoryStore;

  beforeEach(() => {
    store = new MemoryStore();
  });

  it("returns the existing order for a repeated event id without another POS attempt", async () => {
    const app = createApp(store);
    const first = await request(app).post("/payment-events").send(validEvent);
    expect(first.status).toBe(201);
    expect(first.body.order.posAttemptCount).toBe(1);

    const second = await request(app).post("/payment-events").send(validEvent);

    expect(second.status).toBe(200);
    expect(second.body.duplicate).toBe(true);
    expect(second.body.order).toMatchObject({
      id: "ord_001",
      paymentStatus: "paid",
      posStatus: "failed",
      posAttemptCount: 1,
    });
    expect(store.orders.size).toBe(1);
    expect(store.processedEventIds.size).toBe(1);
    expect(store.posTransactions.size).toBe(0);
  });

  it("accepts a different event id for the same unchanged order without a new POS transaction", async () => {
    const app = createApp(store);
    await request(app).post("/payment-events").send(validEvent);
    await syncOrderToPos(store, "ord_001");

    expect(store.posTransactions.size).toBe(1);
    const attemptCount = store.getOrder("ord_001")?.posAttemptCount;

    const replay = await request(app)
      .post("/payment-events")
      .send({ ...validEvent, eventId: "evt_002" });

    expect(replay.status).toBe(200);
    expect(replay.body.duplicate).toBe(true);
    expect(replay.body.order).toMatchObject({
      posStatus: "synced",
      posAttemptCount: attemptCount,
      posTransactionRef: "pos_tx_ord_001_2",
    });
    expect(store.getOrderIdForEvent("evt_002")).toBe("ord_001");
    expect(store.posTransactions.size).toBe(1);
    expect(store.orders.size).toBe(1);
  });

  it("rejects conflicting order data without changing the original order or POS record", async () => {
    const app = createApp(store);
    await request(app).post("/payment-events").send(validEvent);
    await syncOrderToPos(store, "ord_001");

    const beforeOrder = structuredClone(store.getOrder("ord_001"));
    const beforeTxCount = store.posTransactions.size;

    const conflict = await request(app)
      .post("/payment-events")
      .send({
        eventId: "evt_conflict",
        type: "payment.succeeded",
        order: {
          ...validEvent.order,
          items: [{ productId: "burger", quantity: 9, price: 1200 }],
          total: 10800,
        },
      });

    expect(conflict.status).toBe(409);
    expect(store.getOrder("ord_001")).toEqual(beforeOrder);
    expect(store.posTransactions.size).toBe(beforeTxCount);
    expect(store.getOrderIdForEvent("evt_conflict")).toBeUndefined();
  });

  it("does not reset POS or refund state on replayed events", async () => {
    const app = createApp(store);
    await request(app).post("/payment-events").send(validEvent);
    await syncOrderToPos(store, "ord_001");

    const order = store.getOrder("ord_001");
    expect(order).toBeDefined();
    if (!order) {
      return;
    }

    order.paymentStatus = "refunded";
    order.refundStatus = "refunded";
    order.refundedAmount = order.total;
    store.saveOrder(order);

    const replaySameEvent = await request(app)
      .post("/payment-events")
      .send(validEvent);
    const replayNewEvent = await request(app)
      .post("/payment-events")
      .send({ ...validEvent, eventId: "evt_after_refund" });

    expect(replaySameEvent.status).toBe(200);
    expect(replayNewEvent.status).toBe(200);
    expect(store.getOrder("ord_001")).toMatchObject({
      paymentStatus: "refunded",
      refundStatus: "refunded",
      refundedAmount: 2650,
      posStatus: "synced",
      posTransactionRef: "pos_tx_ord_001_2",
    });
    expect(store.posTransactions.size).toBe(1);
  });
});
