/** Display-only formatting for integer cents. */
export const formatEurCents = (cents: number): string =>
  new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);

export const calculateTotalCents = (
  items: { quantity: number; price: number }[],
): number => items.reduce((sum, item) => sum + item.quantity * item.price, 0);
