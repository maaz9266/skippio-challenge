import type { MemoryStore } from "../store/memoryStore.js";
import type { Order, OrderResponse, PaymentEvent } from "../types/domain.js";
import { orderDataMatches } from "./orderComparison.js";
import { validatePaymentEvent } from "./paymentValidation.js";
import { syncOrderToPos } from "./posSyncService.js";

/**
 * Duplicate / conflict response behaviour (Phase 5):
 *
 * - Same eventId again → 200 with existing order; no new POS attempt.
 * - New eventId, same orderId, matching data → 200 with existing order;
 *   record the new eventId; no new POS attempt; POS/refund state unchanged.
 * - Same orderId with conflicting data → 409; store left unchanged.
 * - First-time event → 201; create paid order; run initial POS sync.
 */

export type ProcessPaymentFailure = {
  ok: false;
  status: 400 | 409;
  error: string;
  details?: string[];
};

export type ProcessPaymentSuccess = {
  ok: true;
  status: 200 | 201;
  order: OrderResponse;
  duplicate?: boolean;
};

export type ProcessPaymentResult = ProcessPaymentFailure | ProcessPaymentSuccess;

export const toOrderResponse = (order: Order): OrderResponse => ({
  id: order.id,
  venueId: order.venueId,
  currency: order.currency,
  items: order.items,
  total: order.total,
  paymentStatus: order.paymentStatus,
  posStatus: order.posStatus,
  posAttemptCount: order.posAttemptCount,
  posTransactionRef: order.posTransactionRef,
  refundStatus: order.refundStatus,
  refundedAmount: order.refundedAmount,
});

const createPaidOrder = (event: PaymentEvent): Order => ({
  id: event.order.id,
  venueId: event.order.venueId,
  currency: event.order.currency,
  items: event.order.items.map((item) => ({ ...item })),
  total: event.order.total,
  paymentStatus: "paid",
  posStatus: "pending",
  posAttemptCount: 0,
  refundStatus: "none",
});

/**
 * Validates and processes a payment event with idempotent duplicate handling.
 */
export const processPaymentEvent = async (
  store: MemoryStore,
  payload: unknown,
): Promise<ProcessPaymentResult> => {
  const validation = validatePaymentEvent(payload);
  if (!validation.ok) {
    return {
      ok: false,
      status: 400,
      error: validation.error,
      details: validation.details,
    };
  }

  const { event } = validation;

  const existingOrderIdForEvent = store.getOrderIdForEvent(event.eventId);
  if (existingOrderIdForEvent) {
    const existing = store.getOrder(existingOrderIdForEvent);
    if (!existing) {
      return {
        ok: false,
        status: 400,
        error: "Processed event references a missing order",
      };
    }

    return {
      ok: true,
      status: 200,
      duplicate: true,
      order: toOrderResponse(existing),
    };
  }

  const existingOrder = store.getOrder(event.order.id);
  if (existingOrder) {
    if (!orderDataMatches(existingOrder, event.order)) {
      return {
        ok: false,
        status: 409,
        error: "Conflicting order data for existing order id",
        details: [
          `Order ${event.order.id} already exists with different data`,
        ],
      };
    }

    // Same order, new event id — acknowledge without side effects.
    store.recordProcessedEvent(event.eventId, existingOrder.id);

    return {
      ok: true,
      status: 200,
      duplicate: true,
      order: toOrderResponse(existingOrder),
    };
  }

  const order = createPaidOrder(event);

  store.saveOrder(order);
  store.recordProcessedEvent(event.eventId, order.id);

  // Initial POS attempt: deterministic failure; payment remains paid.
  await syncOrderToPos(store, order.id);

  const latest = store.getOrder(order.id) ?? order;

  return {
    ok: true,
    status: 201,
    order: toOrderResponse(latest),
  };
};
