import cors from "cors";
import express from "express";

export function createApp() {
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

  return app;
}
