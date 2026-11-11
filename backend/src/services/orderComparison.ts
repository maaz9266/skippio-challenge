import type { Order, OrderItem, PaymentEventOrder } from "../types/domain.js";

const itemsEqual = (a: OrderItem[], b: OrderItem[]): boolean => {
  if (a.length !== b.length) {
    return false;
  }

  // Compare items in supplied order (sufficient for this challenge).
  return a.every((item, index) => {
    const other = b[index];
    return (
      item.productId === other.productId &&
      item.quantity === other.quantity &&
      item.price === other.price
    );
  });
};

/** True when incoming payment-order data matches the stored order. */
export const orderDataMatches = (
  stored: Order,
  incoming: PaymentEventOrder,
): boolean =>
  stored.id === incoming.id &&
  stored.venueId === incoming.venueId &&
  stored.currency === incoming.currency &&
  stored.total === incoming.total &&
  itemsEqual(stored.items, incoming.items);
