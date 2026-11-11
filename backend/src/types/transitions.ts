import type { PaymentStatus, PosStatus, RefundStatus } from "./domain.js";

/**
 * Allowed state transitions (single-process, in-memory).
 *
 * paymentStatus:
 *   (create order) → paid → refunded
 *
 * posStatus:
 *   (create order) → pending
 *   pending → syncing
 *   syncing → failed | synced
 *   failed  → syncing   (retry)
 *   synced  → (terminal for POS; no further sync)
 *
 * refundStatus:
 *   none → refunded
 *   Only when paymentStatus === "paid" AND posStatus === "synced".
 *
 * Rules:
 * - A POS failure must not change paymentStatus.
 * - Replayed payment events must not clear refunded status.
 * - `syncing` must be set before any asynchronous POS call begins.
 */

const PAYMENT_TRANSITIONS: Record<PaymentStatus, readonly PaymentStatus[]> = {
  paid: ["refunded"],
  refunded: [],
};

const POS_TRANSITIONS: Record<PosStatus, readonly PosStatus[]> = {
  pending: ["syncing"],
  syncing: ["failed", "synced"],
  failed: ["syncing"],
  synced: [],
};

const REFUND_TRANSITIONS: Record<RefundStatus, readonly RefundStatus[]> = {
  none: ["refunded"],
  refunded: [],
};

export const canTransitionPayment = (
  from: PaymentStatus,
  to: PaymentStatus,
): boolean => PAYMENT_TRANSITIONS[from].includes(to);

export const canTransitionPos = (from: PosStatus, to: PosStatus): boolean =>
  POS_TRANSITIONS[from].includes(to);

export const canTransitionRefund = (
  from: RefundStatus,
  to: RefundStatus,
): boolean => REFUND_TRANSITIONS[from].includes(to);

/** Refund is eligible only when the order is paid and POS-synced. */
export const isRefundEligible = (input: {
  paymentStatus: PaymentStatus;
  posStatus: PosStatus;
  refundStatus: RefundStatus;
}): boolean =>
  input.paymentStatus === "paid" &&
  input.posStatus === "synced" &&
  input.refundStatus === "none";
