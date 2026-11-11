import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import {
  getPosAdapterMetrics,
  resetPosAdapterMetrics,
} from "../src/pos/adapter.js";
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

describe("POS sync concurrency", () => {
  let store: MemoryStore;

  beforeEach(() => {
    store = new MemoryStore();
    resetPosAdapterMetrics();
  });

  it("allows only one POS call when overlapping retries use a real delay", async () => {
    const app = createApp(store);
    await request(app).post("/payment-events").send(validEvent);
    resetPosAdapterMetrics();

    // Start first retry; keep POS in flight with a delay.
    const first = syncOrderToPos(store, "ord_001", { delayMs: 80 });

    // Yield so the first request can claim `syncing` and enter submitToPos.
    await new Promise((resolve) => setTimeout(resolve, 15));
    expect(store.getOrder("ord_001")?.posStatus).toBe("syncing");
    expect(getPosAdapterMetrics().inFlight).toBe(1);

    const second = syncOrderToPos(store, "ord_001", { delayMs: 80 });
    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(firstResult.ok).toBe(true);
    expect(firstResult.order.posStatus).toBe("synced");

    expect(secondResult.ok).toBe(false);
    if (!secondResult.ok) {
      expect(secondResult.inProgress).toBe(true);
      expect(secondResult.error).toMatch(/already in progress/i);
    }

    // Without the syncing guard, both would enter POS (maxInFlight >= 2).
    // With the guard, only one POS submission runs even though the delay
    // keeps that call alive long enough for a second request to arrive.
    expect(getPosAdapterMetrics().submitCallCount).toBe(1);
    expect(getPosAdapterMetrics().maxInFlight).toBe(1);
    expect(store.posTransactions.size).toBe(1);
    expect(store.getOrder("ord_001")?.posStatus).toBe("synced");
    expect(store.getOrder("ord_001")?.posAttemptCount).toBe(2);
  });

  it("clears syncing on failure so a later retry can succeed", async () => {
    const app = createApp(store);
    await request(app).post("/payment-events").send(validEvent);

    expect(store.getOrder("ord_001")?.posStatus).toBe("failed");

    const retry = await syncOrderToPos(store, "ord_001");
    expect(retry.ok).toBe(true);
    expect(store.getOrder("ord_001")?.posStatus).toBe("synced");
    expect(store.posTransactions.size).toBe(1);
  });

  it("does not start another POS call after success", async () => {
    const app = createApp(store);
    await request(app).post("/payment-events").send(validEvent);
    await syncOrderToPos(store, "ord_001");
    resetPosAdapterMetrics();

    const again = await syncOrderToPos(store, "ord_001", { delayMs: 50 });

    expect(again.ok).toBe(true);
    expect(getPosAdapterMetrics().submitCallCount).toBe(0);
    expect(store.posTransactions.size).toBe(1);
  });
});
