import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { MemoryStore } from "../src/store/memoryStore.js";

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

describe("POST /payment-events", () => {
  let store: MemoryStore;

  beforeEach(() => {
    store = new MemoryStore();
  });

  it("creates one paid order for a valid first-time event", async () => {
    const app = createApp(store);
    const response = await request(app)
      .post("/payment-events")
      .send(validEvent);

    expect(response.status).toBe(201);
    expect(response.body.order).toMatchObject({
      id: "ord_001",
      venueId: "venue_001",
      currency: "EUR",
      total: 2650,
      paymentStatus: "paid",
      posStatus: "pending",
      posAttemptCount: 0,
      refundStatus: "none",
    });
    expect(response.body.order.items).toEqual(validEvent.order.items);

    expect(store.orders.size).toBe(1);
    expect(store.getOrder("ord_001")?.paymentStatus).toBe("paid");
    expect(store.getOrderIdForEvent("evt_001")).toBe("ord_001");
    expect(store.posTransactions.size).toBe(0);
  });

  it("rejects invalid event type", async () => {
    const app = createApp(store);
    const response = await request(app)
      .post("/payment-events")
      .send({ ...validEvent, type: "payment.failed" });

    expect(response.status).toBe(400);
    expect(store.orders.size).toBe(0);
    expect(store.processedEventIds.size).toBe(0);
  });

  it("rejects non-EUR currency", async () => {
    const app = createApp(store);
    const response = await request(app)
      .post("/payment-events")
      .send({
        ...validEvent,
        order: { ...validEvent.order, currency: "USD" },
      });

    expect(response.status).toBe(400);
    expect(store.orders.size).toBe(0);
  });

  it("rejects empty identifiers", async () => {
    const app = createApp(store);
    const response = await request(app)
      .post("/payment-events")
      .send({
        ...validEvent,
        eventId: "  ",
        order: { ...validEvent.order, id: "", venueId: "" },
      });

    expect(response.status).toBe(400);
    expect(store.orders.size).toBe(0);
  });

  it("rejects empty items", async () => {
    const app = createApp(store);
    const response = await request(app)
      .post("/payment-events")
      .send({
        ...validEvent,
        order: { ...validEvent.order, items: [], total: 0 },
      });

    expect(response.status).toBe(400);
    expect(store.orders.size).toBe(0);
  });

  it("rejects non-positive quantities and negative prices", async () => {
    const app = createApp(store);
    const response = await request(app)
      .post("/payment-events")
      .send({
        ...validEvent,
        order: {
          ...validEvent.order,
          items: [{ productId: "burger", quantity: 0, price: -1 }],
          total: 0,
        },
      });

    expect(response.status).toBe(400);
    expect(store.orders.size).toBe(0);
  });

  it("rejects mismatched totals without creating partial records", async () => {
    const app = createApp(store);
    const response = await request(app)
      .post("/payment-events")
      .send({
        ...validEvent,
        order: { ...validEvent.order, total: 9999 },
      });

    expect(response.status).toBe(400);
    expect(response.body.details?.some((d: string) => d.includes("total"))).toBe(
      true,
    );
    expect(store.orders.size).toBe(0);
    expect(store.processedEventIds.size).toBe(0);
    expect(store.posTransactions.size).toBe(0);
  });
});
