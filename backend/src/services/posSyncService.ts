import { submitToPos } from "../pos/adapter.js";
import { PosRejectionError } from "../pos/types.js";
import type { MemoryStore } from "../store/memoryStore.js";
import type { Order } from "../types/domain.js";
import { canTransitionPos } from "../types/transitions.js";

export type SyncOrderResult =
  | { ok: true; order: Order }
  | { ok: false; order: Order; error: string };

const buildPosPayload = (order: Order) => ({
  venueId: order.venueId,
  orderRef: order.id,
  items: order.items.map((item) => ({ ...item })),
  currency: order.currency,
  total: order.total,
});

/**
 * Attempts POS synchronisation for an order.
 *
 * Attempt accounting:
 * - `posAttemptCount` is incremented when the attempt starts (before the POS call).
 * - An accepted `PosTransaction` is written only after the adapter accepts.
 * - Failure sets `posStatus` to `failed` and never changes `paymentStatus`.
 */
export const syncOrderToPos = async (
  store: MemoryStore,
  orderId: string,
  options?: { delayMs?: number },
): Promise<SyncOrderResult> => {
  const order = store.getOrder(orderId);
  if (!order) {
    throw new Error(`Order not found: ${orderId}`);
  }

  if (order.posStatus === "synced") {
    return { ok: true, order };
  }

  if (order.posStatus === "syncing") {
    return {
      ok: false,
      order,
      error: "POS synchronisation already in progress",
    };
  }

  if (!canTransitionPos(order.posStatus, "syncing")) {
    return {
      ok: false,
      order,
      error: `Cannot start POS sync from status ${order.posStatus}`,
    };
  }

  order.posStatus = "syncing";
  order.posAttemptCount += 1;
  store.saveOrder(order);

  const attemptNumber = order.posAttemptCount;

  try {
    const acceptance = await submitToPos(
      buildPosPayload(order),
      attemptNumber,
      options?.delayMs ?? 0,
    );

    const transaction = {
      transactionRef: acceptance.transactionRef,
      orderId: order.id,
      venueId: order.venueId,
      currency: order.currency,
      items: order.items.map((item) => ({ ...item })),
      total: order.total,
      createdAt: new Date().toISOString(),
    };

    store.savePosTransaction(transaction);

    order.posStatus = "synced";
    order.posTransactionRef = acceptance.transactionRef;
    store.saveOrder(order);

    return { ok: true, order };
  } catch (error) {
    order.posStatus = "failed";
    store.saveOrder(order);

    const message =
      error instanceof PosRejectionError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Unknown POS error";

    return { ok: false, order, error: message };
  }
};
