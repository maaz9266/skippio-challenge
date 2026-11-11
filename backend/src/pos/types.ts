import type { Currency, OrderItem } from "../types/domain.js";

/** Payload sent to the simulated POS. */
export type PosPayload = {
  venueId: string;
  orderRef: string;
  items: OrderItem[];
  currency: Currency;
  total: number;
};

export type PosAcceptance = {
  transactionRef: string;
};

export class PosRejectionError extends Error {
  readonly code = "POS_REJECTED" as const;

  constructor(message = "POS rejected the transaction") {
    super(message);
    this.name = "PosRejectionError";
  }
}
