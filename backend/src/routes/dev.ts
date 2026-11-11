import { Router } from "express";
import type { MemoryStore } from "../store/memoryStore.js";
import { toOrderResponse } from "../services/paymentService.js";

/**
 * Local-only inspection / testing helpers (not part of the challenge API).
 */
export const createDevRouter = (store: MemoryStore): Router => {
  const router = Router();

  router.get("/store", (_req, res) => {
    res.json({
      orders: Object.fromEntries(store.orders.entries()),
      processedEventIds: Object.fromEntries(store.processedEventIds.entries()),
      posTransactions: Object.fromEntries(store.posTransactions.entries()),
      counts: {
        orders: store.orders.size,
        processedEventIds: store.processedEventIds.size,
        posTransactions: store.posTransactions.size,
      },
    });
  });

  router.post("/store/reset", (_req, res) => {
    store.reset();
    res.json({ ok: true, message: "In-memory store cleared" });
  });

  /** Revert POS sync so the order looks failed after a first attempt. */
  router.post("/orders/:orderId/unsync", (req, res) => {
    const order = store.getOrder(req.params.orderId);
    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }

    const removed = store.deletePosTransactionsForOrder(order.id);
    order.posStatus = "failed";
    order.posAttemptCount = Math.max(1, order.posAttemptCount);
    delete order.posTransactionRef;
    store.saveOrder(order);

    res.status(200).json({
      ok: true,
      message: "Order POS state reset to failed (not synced)",
      removedPosTransactions: removed,
      order: toOrderResponse(order),
    });
  });

  /** Revert refund so the order is paid again (refund eligible if still synced). */
  router.post("/orders/:orderId/unrefund", (req, res) => {
    const order = store.getOrder(req.params.orderId);
    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }

    order.paymentStatus = "paid";
    order.refundStatus = "none";
    delete order.refundedAmount;
    store.saveOrder(order);

    res.status(200).json({
      ok: true,
      message: "Order refund state cleared",
      order: toOrderResponse(order),
    });
  });

  return router;
};
