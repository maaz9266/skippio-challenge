# Challenge answers

Approximate time spent: **~2 hours**.

Repo: https://github.com/maaz9266/skippio-challenge

---

## Scope & stack

- TypeScript end-to-end; Node/Express backend; Vite + React frontend
- Apps: `backend/` + `frontend/`; HTTP; business logic in backend
- In-memory store, single process — no DB, auth, queues, cloud, or real POS/payments

Build order was backend-first then UI (brief suggested UI-first); behaviour matches the brief.

---

## APIs

### `POST /payment-events`
Validate `payment.succeeded` + `EUR`, nonempty IDs, ≥1 item, positive qty, nonnegative integer cents, total = Σ(qty × price). Create paid order, then attempt POS sync (first attempt fails by design).

| Case | Response |
|------|----------|
| New valid event | **201** + order |
| Same / matching duplicate | **200** + `duplicate: true` (no new POS side effect) |
| Conflicting order data | **409** (store unchanged) |
| Invalid payload | **400** |

### `GET /orders/:orderId`
Order details, payment/POS/refund state, attempt count, POS ref. Unknown → **404**.

### `POST /orders/:orderId/sync`
Same core sync as payment. Failed → retryable; already synced → **200** + `alreadySynced` (no extra POS tx); in progress → **409**; unknown → **404**.

### `POST /orders/:orderId/refund`
Full refund only if paid + POS synced. Records `refundedAmount` (= total). Repeat/concurrent → **409**; ineligible → **400**; unknown → **404**. Payment replay does not clear refund.

---

## POS

- Local async adapter (`backend/src/pos/adapter.ts`); no second server
- Attempt 1 fails before acceptance; attempt ≥2 succeeds
- Accepted txs stored separately in `posTransactions`
- Duplicates prevented via event-ID map, order match/conflict checks, and a pre-`await` `syncing` claim so overlapping syncs cannot double-call POS

---

## Frontend

One screen: form-built payment payload (no JSON editor), resubmit, lookup, € display, payment vs POS state, retry when failed. Optional refund button + `/dev` debug panel (extras).

Ports: UI **3000**, API **3001**.

---

## Verification

Six brief test groups covered (see `backend/tests/brief-verification.test.ts` and related suites). Run: `cd backend && npm test`.

Manual UI: submit, duplicate resubmit, lookup, fail → retry. No automated frontend tests.

---

## Assumptions

1. Matching duplicates → **200** ACK, not an error  
2. Conflict → **409**; sync in progress → **409**  
3. Already synced → **200** + `alreadySynced`  
4. Item equality = compare items in supplied order  
5. Refund UI / `/dev` tooling are optional extras  
