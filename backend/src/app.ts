import cors from "cors";
import express from "express";
import { memoryStore, type MemoryStore } from "./store/memoryStore.js";
import { createDebugRouter } from "./routes/debug.js";
import { createPaymentEventsRouter } from "./routes/paymentEvents.js";

export const createApp = (store: MemoryStore = memoryStore) => {
  const app = express();

  app.use(
    cors({
      origin: ["http://localhost:3000"],
    }),
  );
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.use("/payment-events", createPaymentEventsRouter(store));
  app.use("/debug", createDebugRouter(store));

  return app;
};
