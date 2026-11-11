import { submitToPos } from "../pos/adapter.js";
import { PosRejectionError } from "../pos/types.js";
import type { MemoryStore } from "../store/memoryStore.js";
import type { Order } from "../types/domain.js";
import { canTransitionPos } from "../types/transitions.js";

export type SyncOrderResult =
  | { ok: true; order: Order }
  | { ok: false; order: Order; error: string; inProgress?: boolean };

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
 * Concurrency (single process):
 * - Race: two requests could both read `pending`/`failed` and both call POS
 *   if status were updated only after an `await`.
 * - Guard: transition to `syncing` and increment `posAttemptCount`
 *   synchronously before any asynchronous POS call. A second overlapping
 *   request sees `syncing` and returns without calling POS.
 *
 * Overlapping response: `{ ok: false, inProgress: true, error: "..." }`.
 * After success: `synced` (no further POS calls).
 * After failure: `failed` (eligible for retry); `paymentStatus` unchanged.
 * `syncing` is always cleared to `failed` or `synced` before return.
 *
 * Paths that call this: initial payment processing; later manual retry (Phase 7).
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
      inProgress: true,
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

  // Claim the sync slot before the first await (closes the check-then-act race).
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
