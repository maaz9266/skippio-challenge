import { Router } from "express";
import type { MemoryStore } from "../store/memoryStore.js";
import { processPaymentEvent } from "../services/paymentService.js";

export const createPaymentEventsRouter = (store: MemoryStore): Router => {
  const router = Router();

  router.post("/", async (req, res) => {
    const result = await processPaymentEvent(store, req.body);

    if (!result.ok) {
      res.status(result.status).json({
        error: result.error,
        details: result.details,
      });
      return;
    }

    res.status(result.status).json({ order: result.order });
  });

  return router;
};
