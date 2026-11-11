import type { MemoryStore } from "../store/memoryStore.js";
import type { OrderResponse } from "../types/domain.js";
import { isRefundEligible } from "../types/transitions.js";
import { toOrderResponse } from "./paymentService.js";

export type RefundResult =
  | { ok: true; status: 200; order: OrderResponse }
  | {
      ok: false;
      status: 400 | 404 | 409;
      error: string;
      order?: OrderResponse;
    };

/**
 * Simulated full refund.
 *
 * Responses:
 * - 200: refund applied (amount = order.total)
 * - 409: already refunded (order unchanged)
 * - 400: ineligible (not paid+synced, or refund not none)
 * - 404: unknown order
 *
 * Concurrency: eligibility check + status writes are synchronous, so two
 * overlapping requests cannot both apply a refund in a single process.
 */
export const refundOrder = (
  store: MemoryStore,
  orderId: string,
): RefundResult => {
  const order = store.getOrder(orderId);
  if (!order) {
    return { ok: false, status: 404, error: "Order not found" };
  }

  if (order.refundStatus === "refunded" || order.paymentStatus === "refunded") {
    return {
      ok: false,
      status: 409,
      error: "Order already refunded",
      order: toOrderResponse(order),
    };
  }

  if (!isRefundEligible(order)) {
    return {
      ok: false,
      status: 400,
      error:
        "Order is not eligible for refund (must be paid and POS-synced)",
      order: toOrderResponse(order),
    };
  }

  // Claim + apply in one synchronous turn (no await before mutation).
  order.paymentStatus = "refunded";
  order.refundStatus = "refunded";
  order.refundedAmount = order.total;
  store.saveOrder(order);

  return { ok: true, status: 200, order: toOrderResponse(order) };
};
