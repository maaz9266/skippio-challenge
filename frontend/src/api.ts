const API_BASE = import.meta.env.VITE_API_URL ?? "/api";

export type LineItem = {
  productId: string;
  quantity: number;
  price: number;
};

export type OrderView = {
  id: string;
  venueId: string;
  currency: string;
  items: LineItem[];
  total: number;
  paymentStatus: string;
  posStatus: string;
  posAttemptCount: number;
  posTransactionRef?: string;
  refundStatus: string;
  refundedAmount?: number;
};

export type PaymentEventPayload = {
  eventId: string;
  type: "payment.succeeded";
  order: {
    id: string;
    venueId: string;
    currency: "EUR";
    items: LineItem[];
    total: number;
  };
};

const parseJson = async (response: Response): Promise<unknown> => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

export const postPaymentEvent = async (payload: PaymentEventPayload) => {
  const response = await fetch(`${API_BASE}/payment-events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return { status: response.status, body: await parseJson(response) };
};

export const getOrder = async (orderId: string) => {
  const response = await fetch(`${API_BASE}/orders/${encodeURIComponent(orderId)}`);
  return { status: response.status, body: await parseJson(response) };
};

export const syncOrder = async (orderId: string) => {
  const response = await fetch(
    `${API_BASE}/orders/${encodeURIComponent(orderId)}/sync`,
    { method: "POST" },
  );
  return { status: response.status, body: await parseJson(response) };
};

export const getDevStore = async () => {
  const response = await fetch(`${API_BASE}/dev/store`);
  return { status: response.status, body: await parseJson(response) };
};

export const resetDevStore = async () => {
  const response = await fetch(`${API_BASE}/dev/store/reset`, { method: "POST" });
  return { status: response.status, body: await parseJson(response) };
};
