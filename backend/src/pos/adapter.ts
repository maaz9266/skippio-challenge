import type { PosAcceptance, PosPayload } from "./types.js";
import { PosRejectionError } from "./types.js";

let submitCallCount = 0;
let inFlight = 0;
let maxInFlight = 0;

/** Test helpers — prove genuine overlap / single in-flight POS call. */
export const getPosAdapterMetrics = () => ({
  submitCallCount,
  inFlight,
  maxInFlight,
});

export const resetPosAdapterMetrics = () => {
  submitCallCount = 0;
  inFlight = 0;
  maxInFlight = 0;
};

/**
 * Local asynchronous POS adapter (no second server).
 *
 * Deterministic behaviour:
 * - attemptNumber === 1 → reject before acceptance (no transaction ref)
 * - attemptNumber >= 2 → accept and return a transaction reference
 *
 * Optional `delayMs` lets concurrency tests keep the call in flight so
 * overlapping requests can be observed.
 */
export const submitToPos = async (
  payload: PosPayload,
  attemptNumber: number,
  delayMs = 0,
): Promise<PosAcceptance> => {
  submitCallCount += 1;
  inFlight += 1;
  maxInFlight = Math.max(maxInFlight, inFlight);

  try {
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
  } finally {
    inFlight -= 1;
  }
};
