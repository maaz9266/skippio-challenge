import type { Order, PosTransaction } from "../types/domain.js";

/**
 * In-memory stores for a single backend process.
 *
 * - orders: keyed by order id
 * - processedEventIds: event id → order id (idempotency / replay tracking)
 * - posTransactions: accepted POS side effects, separate from orders
 */
export class MemoryStore {
  readonly orders = new Map<string, Order>();
  readonly processedEventIds = new Map<string, string>();
  readonly posTransactions = new Map<string, PosTransaction>();

  getOrder(orderId: string): Order | undefined {
    return this.orders.get(orderId);
  }

  saveOrder(order: Order): void {
    this.orders.set(order.id, order);
  }

  getOrderIdForEvent(eventId: string): string | undefined {
    return this.processedEventIds.get(eventId);
  }

  recordProcessedEvent(eventId: string, orderId: string): void {
    this.processedEventIds.set(eventId, orderId);
  }

  getPosTransaction(transactionRef: string): PosTransaction | undefined {
    return this.posTransactions.get(transactionRef);
  }

  listPosTransactionsForOrder(orderId: string): PosTransaction[] {
    return [...this.posTransactions.values()].filter(
      (tx) => tx.orderId === orderId,
    );
  }

  savePosTransaction(transaction: PosTransaction): void {
    this.posTransactions.set(transaction.transactionRef, transaction);
  }

  /** Clears all maps — intended for tests. */
  reset(): void {
    this.orders.clear();
    this.processedEventIds.clear();
    this.posTransactions.clear();
  }
}

/** Shared store used by the running server. Tests should prefer a fresh instance. */
export const memoryStore = new MemoryStore();
