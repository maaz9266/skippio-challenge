import type { MemoryStore } from "../store/memoryStore.js";
import type { Order, OrderResponse, PaymentEvent } from "../types/domain.js";
import { validatePaymentEvent } from "./paymentValidation.js";
import { syncOrderToPos } from "./posSyncService.js";

export type ProcessPaymentFailure = {
  ok: false;
  status: 400;
  error: string;
  details?: string[];
};

export type ProcessPaymentSuccess = {
  ok: true;
  status: 201;
  order: OrderResponse;
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
 * Validates and records a first-time payment event as a paid order,
 * then attempts POS synchronisation (first attempt fails by design).
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
