import { Router } from "express";
import type { MemoryStore } from "../store/memoryStore.js";
import { toOrderResponse } from "../services/paymentService.js";
import { refundOrder } from "../services/refundService.js";
import { syncOrderToPos } from "../services/posSyncService.js";

/**
 * Order lookup, POS sync retry, and full refund.
 *
 * POST /orders/:orderId/sync:
 * - 200: synced / already synced / POS rejected (paid preserved)
 * - 409: sync already in progress
 * - 404: unknown order
 * Optional `?delayMs=` for local race demos / tests.
 *
 * POST /orders/:orderId/refund:
 * - 200: full refund applied
 * - 409: already refunded
 * - 400: ineligible
 * - 404: unknown order
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
      alreadySynced: result.ok ? result.alreadySynced : undefined,
      error: result.ok ? undefined : result.error,
      order: toOrderResponse(result.order),
    });
  });

  router.post("/:orderId/refund", (req, res) => {
    const result = refundOrder(store, req.params.orderId);

    if (!result.ok) {
      res.status(result.status).json({
        error: result.error,
        order: result.order,
      });
      return;
    }

    res.status(result.status).json({ order: result.order });
  });

  return router;
};
