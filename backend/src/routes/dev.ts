import { Router } from "express";
import type { MemoryStore } from "../store/memoryStore.js";

/**
 * Local-only inspection helpers (not part of the challenge API surface).
 * Retained temporarily for development; remove before final submission if desired.
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

  return router;
};
