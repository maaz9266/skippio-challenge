/**
 * Maps 1:1 to the six automated verification groups in the challenge brief.
 * Each group asserts observable behaviour (order state + POS transaction store).
 */
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import {
  getPosAdapterMetrics,
  resetPosAdapterMetrics,
} from "../src/pos/adapter.js";
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

describe("Brief verification groups", () => {
  let store: MemoryStore;

  beforeEach(() => {
    store = new MemoryStore();
    resetPosAdapterMetrics();
  });

  describe("1. Valid event → paid order and one POS transaction", () => {
    it("creates a paid order and eventually exactly one POS transaction via retry", async () => {
      const app = createApp(store);

      const created = await request(app)
        .post("/payment-events")
        .send(validEvent);

      expect(created.status).toBe(201);
      expect(created.body.order).toMatchObject({
        paymentStatus: "paid",
        posStatus: "failed",
        posAttemptCount: 1,
      });
      expect(store.posTransactions.size).toBe(0);

      const synced = await request(app).post("/orders/ord_001/sync");
      expect(synced.status).toBe(200);
      expect(synced.body.order).toMatchObject({
        paymentStatus: "paid",
        posStatus: "synced",
        posTransactionRef: "pos_tx_ord_001_2",
      });
      expect(store.posTransactions.size).toBe(1);
      expect(store.listPosTransactionsForOrder("ord_001")).toHaveLength(1);
    });
  });

  describe("2. Duplicate delivery → no duplicate POS transaction", () => {
    it("rejects extra side effects for same and different event ids", async () => {
      const app = createApp(store);
      await request(app).post("/payment-events").send(validEvent);
      await request(app).post("/orders/ord_001/sync");
      expect(store.posTransactions.size).toBe(1);

      const sameEvent = await request(app)
        .post("/payment-events")
        .send(validEvent);
      const differentEvent = await request(app)
        .post("/payment-events")
        .send({ ...validEvent, eventId: "evt_002" });

      expect(sameEvent.status).toBe(200);
      expect(differentEvent.status).toBe(200);
      expect(store.posTransactions.size).toBe(1);
      expect(store.orders.size).toBe(1);
    });
  });

  describe("3. Overlapping requests → no duplicate transaction; POS overlaps", () => {
    it("keeps a single POS call in flight and a single accepted transaction", async () => {
      const app = createApp(store);
      await request(app).post("/payment-events").send(validEvent);
      resetPosAdapterMetrics();

      const first = syncOrderToPos(store, "ord_001", { delayMs: 80 });
      await new Promise((resolve) => setTimeout(resolve, 15));
      expect(getPosAdapterMetrics().inFlight).toBe(1);

      const second = syncOrderToPos(store, "ord_001", { delayMs: 80 });
      const [a, b] = await Promise.all([first, second]);

      expect(a.ok).toBe(true);
      expect(b.ok).toBe(false);
      if (!b.ok) {
        expect(b.inProgress).toBe(true);
      }
      expect(getPosAdapterMetrics().submitCallCount).toBe(1);
      expect(getPosAdapterMetrics().maxInFlight).toBe(1);
      expect(store.posTransactions.size).toBe(1);
    });
  });

  describe("4. Failure and retry", () => {
    it("preserves payment on POS failure, retries successfully, and does not double-charge POS", async () => {
      const app = createApp(store);
      const failed = await request(app).post("/payment-events").send(validEvent);

      expect(failed.body.order.paymentStatus).toBe("paid");
      expect(failed.body.order.posStatus).toBe("failed");
      expect(store.posTransactions.size).toBe(0);

      const retry = await request(app).post("/orders/ord_001/sync");
      expect(retry.body.order.posStatus).toBe("synced");
      expect(store.posTransactions.size).toBe(1);

      const again = await request(app).post("/orders/ord_001/sync");
      expect(again.status).toBe(200);
      expect(again.body.alreadySynced).toBe(true);
      expect(store.posTransactions.size).toBe(1);
      expect(store.getOrder("ord_001")?.posAttemptCount).toBe(2);
    });
  });

  describe("5. Invalid / conflicting data", () => {
    it("rejects invalid totals and conflicting payloads without mutating stores", async () => {
      const app = createApp(store);

      const invalidTotal = await request(app)
        .post("/payment-events")
        .send({
          ...validEvent,
          eventId: "evt_bad",
          order: { ...validEvent.order, id: "ord_bad", total: 1 },
        });
      expect(invalidTotal.status).toBe(400);
      expect(store.orders.size).toBe(0);
      expect(store.processedEventIds.size).toBe(0);
      expect(store.posTransactions.size).toBe(0);

      await request(app).post("/payment-events").send(validEvent);
      await request(app).post("/orders/ord_001/sync");
      const before = structuredClone(store.getOrder("ord_001"));
      const beforeTx = store.posTransactions.size;

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
      expect(store.getOrder("ord_001")).toEqual(before);
      expect(store.posTransactions.size).toBe(beforeTx);
      expect(store.getOrderIdForEvent("evt_conflict")).toBeUndefined();
    });
  });

  describe("6. Full refund", () => {
    it("refunds once safely and preserves refund across payment replay", async () => {
      const app = createApp(store);
      await request(app).post("/payment-events").send(validEvent);
      await request(app).post("/orders/ord_001/sync");

      const refund = await request(app).post("/orders/ord_001/refund");
      expect(refund.status).toBe(200);
      expect(refund.body.order).toMatchObject({
        paymentStatus: "refunded",
        refundStatus: "refunded",
        refundedAmount: 2650,
      });

      const [a, b] = await Promise.all([
        request(app).post("/orders/ord_001/refund"),
        request(app).post("/orders/ord_001/refund"),
      ]);
      expect([a.status, b.status].sort()).toEqual([409, 409]);

      const replay = await request(app).post("/payment-events").send(validEvent);
      expect(replay.status).toBe(200);
      expect(replay.body.order).toMatchObject({
        paymentStatus: "refunded",
        refundStatus: "refunded",
        refundedAmount: 2650,
      });

      const unknown = await request(app).post("/orders/missing/refund");
      expect(unknown.status).toBe(404);

      const ineligibleApp = createApp(new MemoryStore());
      await request(ineligibleApp).post("/payment-events").send({
        ...validEvent,
        eventId: "evt_x",
        order: { ...validEvent.order, id: "ord_x" },
      });
      const ineligible = await request(ineligibleApp).post(
        "/orders/ord_x/refund",
      );
      expect(ineligible.status).toBe(400);
    });
  });
});
