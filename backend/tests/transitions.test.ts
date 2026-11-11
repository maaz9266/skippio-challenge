import { describe, expect, it } from "vitest";
import {
  canTransitionPayment,
  canTransitionPos,
  canTransitionRefund,
  isRefundEligible,
} from "../src/types/transitions.js";
import { MemoryStore } from "../src/store/memoryStore.js";
import type { Order, PosTransaction } from "../src/types/domain.js";

describe("state transitions", () => {
  it("allows paid → refunded and rejects further payment transitions", () => {
    expect(canTransitionPayment("paid", "refunded")).toBe(true);
    expect(canTransitionPayment("refunded", "paid")).toBe(false);
  });

  it("models POS pending → syncing → failed|synced and retry from failed", () => {
    expect(canTransitionPos("pending", "syncing")).toBe(true);
    expect(canTransitionPos("syncing", "failed")).toBe(true);
    expect(canTransitionPos("syncing", "synced")).toBe(true);
    expect(canTransitionPos("failed", "syncing")).toBe(true);
    expect(canTransitionPos("synced", "syncing")).toBe(false);
    expect(canTransitionPos("pending", "synced")).toBe(false);
  });

  it("allows a single refund transition", () => {
    expect(canTransitionRefund("none", "refunded")).toBe(true);
    expect(canTransitionRefund("refunded", "none")).toBe(false);
  });

  it("requires paid + synced + none for refund eligibility", () => {
    expect(
      isRefundEligible({
        paymentStatus: "paid",
        posStatus: "synced",
        refundStatus: "none",
      }),
    ).toBe(true);

    expect(
      isRefundEligible({
        paymentStatus: "paid",
        posStatus: "failed",
        refundStatus: "none",
      }),
    ).toBe(false);
  });
});

describe("MemoryStore", () => {
  it("tracks orders, event ids, and POS transactions independently", () => {
    const store = new MemoryStore();

    const order: Order = {
      id: "ord_001",
      venueId: "venue_001",
      currency: "EUR",
      items: [{ productId: "burger", quantity: 2, price: 1200 }],
      total: 2400,
      paymentStatus: "paid",
      posStatus: "pending",
      posAttemptCount: 0,
      refundStatus: "none",
    };

    const tx: PosTransaction = {
      transactionRef: "pos_tx_001",
      orderId: "ord_001",
      venueId: "venue_001",
      currency: "EUR",
      items: order.items,
      total: 2400,
      createdAt: new Date().toISOString(),
    };

    store.saveOrder(order);
    store.recordProcessedEvent("evt_001", "ord_001");
    store.savePosTransaction(tx);

    expect(store.getOrder("ord_001")).toEqual(order);
    expect(store.getOrderIdForEvent("evt_001")).toBe("ord_001");
    expect(store.listPosTransactionsForOrder("ord_001")).toHaveLength(1);
    expect(store.orders.size).toBe(1);
    expect(store.processedEventIds.size).toBe(1);
    expect(store.posTransactions.size).toBe(1);

    store.reset();
    expect(store.orders.size).toBe(0);
    expect(store.processedEventIds.size).toBe(0);
    expect(store.posTransactions.size).toBe(0);
  });
});
