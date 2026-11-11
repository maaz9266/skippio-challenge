import { Router } from "express";
import type { MemoryStore } from "../store/memoryStore.js";
import { toOrderResponse } from "../services/paymentService.js";
import { syncOrderToPos } from "../services/posSyncService.js";

/**
 * Temporary local inspection helpers. Remove before final submission
 * if reviewers should not see debug endpoints.
 */
export const createDebugRouter = (store: MemoryStore): Router => {
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

  /**
   * Temporary sync trigger for local race / retry demos.
   * Optional query: ?delayMs=80 to keep the POS call in flight.
   */
  router.post("/orders/:orderId/sync", async (req, res) => {
    const orderId = req.params.orderId;
    const delayMs = Number(req.query.delayMs ?? 0);

    if (!store.getOrder(orderId)) {
      res.status(404).json({ error: `Order not found: ${orderId}` });
      return;
    }

    try {
      const result = await syncOrderToPos(store, orderId, {
        delayMs: Number.isFinite(delayMs) ? delayMs : 0,
      });

      res.status(result.ok ? 200 : 409).json({
        ok: result.ok,
        inProgress: !result.ok ? result.inProgress : undefined,
        error: !result.ok ? result.error : undefined,
        order: toOrderResponse(result.order),
      });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Sync failed",
      });
    }
  });

  return router;
};
