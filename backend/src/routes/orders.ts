import { Router } from "express";
import type { MemoryStore } from "../store/memoryStore.js";
import { toOrderResponse } from "../services/paymentService.js";
import { syncOrderToPos } from "../services/posSyncService.js";

/**
 * Order lookup and POS sync retry.
 *
 * POST /orders/:orderId/sync responses:
 * - 200: sync succeeded, or order already synced (no extra POS transaction)
 * - 200: sync attempt finished but POS rejected (order remains paid, posStatus failed)
 * - 409: synchronisation already in progress
 * - 404: unknown order
 *
 * Optional `?delayMs=` keeps the fake POS call in flight (local race demos / tests).
 */
export const createOrdersRouter = (store: MemoryStore): Router => {
  const router = Router();

  router.get("/:orderId", (req, res) => {
    const order = store.getOrder(req.params.orderId);
    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }

    res.status(200).json({ order: toOrderResponse(order) });
  });

  router.post("/:orderId/sync", async (req, res) => {
    const orderId = req.params.orderId;
    if (!store.getOrder(orderId)) {
      res.status(404).json({ error: "Order not found" });
      return;
    }

    const delayMs = Number(req.query.delayMs ?? 0);

    const result = await syncOrderToPos(store, orderId, {
      delayMs: Number.isFinite(delayMs) && delayMs > 0 ? delayMs : 0,
    });

    if (!result.ok && result.inProgress) {
      res.status(409).json({
        error: result.error,
        inProgress: true,
        order: toOrderResponse(result.order),
      });
      return;
    }

    res.status(200).json({
      ok: result.ok,
      error: result.ok ? undefined : result.error,
      order: toOrderResponse(result.order),
    });
  });

  return router;
};
