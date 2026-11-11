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

describe("POS synchronisation", () => {
  let store: MemoryStore;

  beforeEach(() => {
    store = new MemoryStore();
  });

  it("fails the first POS attempt without undoing payment or creating a transaction", async () => {
    const app = createApp(store);
    const response = await request(app)
      .post("/payment-events")
      .send(validEvent);

    expect(response.status).toBe(201);
    expect(response.body.order).toMatchObject({
      id: "ord_001",
      paymentStatus: "paid",
      posStatus: "failed",
      posAttemptCount: 1,
    });
    expect(response.body.order.posTransactionRef).toBeUndefined();

    const order = store.getOrder("ord_001");
    expect(order?.paymentStatus).toBe("paid");
    expect(order?.posStatus).toBe("failed");
    expect(order?.posAttemptCount).toBe(1);
    expect(store.posTransactions.size).toBe(0);
    expect(store.listPosTransactionsForOrder("ord_001")).toHaveLength(0);
  });

  it("succeeds on a subsequent retry and stores one observable POS transaction", async () => {
    const app = createApp(store);
    await request(app).post("/payment-events").send(validEvent);

    const retry = await syncOrderToPos(store, "ord_001");

    expect(retry.ok).toBe(true);
    expect(retry.order).toMatchObject({
      paymentStatus: "paid",
      posStatus: "synced",
      posAttemptCount: 2,
      posTransactionRef: "pos_tx_ord_001_2",
    });

    expect(store.posTransactions.size).toBe(1);
    const tx = store.getPosTransaction("pos_tx_ord_001_2");
    expect(tx).toMatchObject({
      transactionRef: "pos_tx_ord_001_2",
      orderId: "ord_001",
      venueId: "venue_001",
      currency: "EUR",
      total: 2650,
      items: validEvent.order.items,
    });
  });

  it("does not create another POS transaction when already synced", async () => {
    const app = createApp(store);
    await request(app).post("/payment-events").send(validEvent);
    await syncOrderToPos(store, "ord_001");

    const again = await syncOrderToPos(store, "ord_001");

    expect(again.ok).toBe(true);
    expect(again.order.posAttemptCount).toBe(2);
    expect(store.posTransactions.size).toBe(1);
  });
});
