import type { PosAcceptance, PosPayload } from "./types.js";
import { PosRejectionError } from "./types.js";

/**
 * Local asynchronous POS adapter (no second server).
 *
 * Deterministic behaviour:
 * - attemptNumber === 1 → reject before acceptance (no transaction ref)
 * - attemptNumber >= 2 → accept and return a transaction reference
 *
 * Optional `delayMs` lets later concurrency tests make calls overlap.
 */
export const submitToPos = async (
  payload: PosPayload,
  attemptNumber: number,
  delayMs = 0,
): Promise<PosAcceptance> => {
  if (delayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  if (attemptNumber < 2) {
    throw new PosRejectionError(
      `POS rejected order ${payload.orderRef} on attempt ${attemptNumber}`,
    );
  }

  return {
    transactionRef: `pos_tx_${payload.orderRef}_${attemptNumber}`,
  };
};
