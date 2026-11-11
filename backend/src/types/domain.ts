/** Monetary amounts are integer cents (e.g. 1200 = EUR 12.00). */

export type Currency = "EUR";

export type PaymentEventType = "payment.succeeded";

/** Payment outcome — independent of POS and refund. */
export type PaymentStatus = "paid" | "refunded";

/**
 * POS synchronisation outcome — independent of payment and refund.
 * `syncing` is the in-flight marker used to prevent concurrent POS calls.
 */
export type PosStatus = "pending" | "syncing" | "failed" | "synced";

/** Refund outcome — independent of POS attempt bookkeeping. */
export type RefundStatus = "none" | "refunded";

export interface OrderItem {
  productId: string;
  /** Positive integer. */
  quantity: number;
  /** Nonnegative integer cents (per-item unit price). */
  price: number;
}

export interface PaymentEventOrder {
  id: string;
  venueId: string;
  currency: Currency;
  items: OrderItem[];
  /** Nonnegative integer cents; must equal Σ(quantity × price). */
  total: number;
}

export interface PaymentEvent {
  eventId: string;
  type: PaymentEventType;
  order: PaymentEventOrder;
}

export interface Order {
  id: string;
  venueId: string;
  currency: Currency;
  items: OrderItem[];
  /** Integer cents. */
  total: number;
  paymentStatus: PaymentStatus;
  posStatus: PosStatus;
  posAttemptCount: number;
  posTransactionRef?: string;
  refundStatus: RefundStatus;
  /** Integer cents; set to the full order total when refunded. */
  refundedAmount?: number;
}

/** Accepted fake POS transaction — stored separately from orders. */
export interface PosTransaction {
  transactionRef: string;
  orderId: string;
  venueId: string;
  currency: Currency;
  items: OrderItem[];
  /** Integer cents. */
  total: number;
  createdAt: string;
}

/** Shape returned by order lookup (Phase 7+). */
export interface OrderResponse {
  id: string;
  venueId: string;
  currency: Currency;
  items: OrderItem[];
  total: number;
  paymentStatus: PaymentStatus;
  posStatus: PosStatus;
  posAttemptCount: number;
  posTransactionRef?: string;
  refundStatus: RefundStatus;
  refundedAmount?: number;
}
