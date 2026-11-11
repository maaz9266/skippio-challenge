import type {
  Currency,
  OrderItem,
  PaymentEvent,
  PaymentEventType,
} from "../types/domain.js";

export type ValidationFailure = {
  ok: false;
  error: string;
  details?: string[];
};

export type ValidationSuccess = {
  ok: true;
  event: PaymentEvent;
};

export type ValidationResult = ValidationFailure | ValidationSuccess;

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const isNonNegativeInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;

const isPositiveInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value > 0;

export const calculateTotalCents = (items: OrderItem[]): number =>
  items.reduce((sum, item) => sum + item.quantity * item.price, 0);

/**
 * Validates an unknown payload as a payment.succeeded event with EUR amounts in cents.
 * Does not touch the store.
 */
export const validatePaymentEvent = (payload: unknown): ValidationResult => {
  const details: string[] = [];

  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    return { ok: false, error: "Invalid payment event payload" };
  }

  const body = payload as Record<string, unknown>;

  if (!isNonEmptyString(body.eventId)) {
    details.push("eventId must be a nonempty string");
  }

  if (body.type !== "payment.succeeded") {
    details.push('type must be "payment.succeeded"');
  }

  if (
    body.order === null ||
    typeof body.order !== "object" ||
    Array.isArray(body.order)
  ) {
    details.push("order must be an object");
    return {
      ok: false,
      error: "Payment event validation failed",
      details,
    };
  }

  const order = body.order as Record<string, unknown>;

  if (!isNonEmptyString(order.id)) {
    details.push("order.id must be a nonempty string");
  }

  if (!isNonEmptyString(order.venueId)) {
    details.push("order.venueId must be a nonempty string");
  }

  if (order.currency !== "EUR") {
    details.push('order.currency must be "EUR"');
  }

  if (!Array.isArray(order.items) || order.items.length === 0) {
    details.push("order.items must be a nonempty array");
  }

  if (!isNonNegativeInteger(order.total)) {
    details.push("order.total must be a nonnegative integer (cents)");
  }

  const items: OrderItem[] = [];

  if (Array.isArray(order.items) && order.items.length > 0) {
    order.items.forEach((rawItem, index) => {
      if (
        rawItem === null ||
        typeof rawItem !== "object" ||
        Array.isArray(rawItem)
      ) {
        details.push(`order.items[${index}] must be an object`);
        return;
      }

      const item = rawItem as Record<string, unknown>;

      if (!isNonEmptyString(item.productId)) {
        details.push(
          `order.items[${index}].productId must be a nonempty string`,
        );
      }

      if (!isPositiveInteger(item.quantity)) {
        details.push(
          `order.items[${index}].quantity must be a positive integer`,
        );
      }

      if (!isNonNegativeInteger(item.price)) {
        details.push(
          `order.items[${index}].price must be a nonnegative integer (cents)`,
        );
      }

      if (
        isNonEmptyString(item.productId) &&
        isPositiveInteger(item.quantity) &&
        isNonNegativeInteger(item.price)
      ) {
        items.push({
          productId: item.productId,
          quantity: item.quantity,
          price: item.price,
        });
      }
    });
  }

  if (
    items.length > 0 &&
    isNonNegativeInteger(order.total) &&
    details.length === 0
  ) {
    const calculated = calculateTotalCents(items);
    if (calculated !== order.total) {
      details.push(
        `order.total mismatch: expected ${calculated} cents, received ${order.total}`,
      );
    }
  }

  if (details.length > 0) {
    return {
      ok: false,
      error: "Payment event validation failed",
      details,
    };
  }

  const event: PaymentEvent = {
    eventId: body.eventId as string,
    type: body.type as PaymentEventType,
    order: {
      id: order.id as string,
      venueId: order.venueId as string,
      currency: order.currency as Currency,
      items,
      total: order.total as number,
    },
  };

  return { ok: true, event };
};
