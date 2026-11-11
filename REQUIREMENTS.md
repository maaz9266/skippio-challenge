# Product & engineering requirements

This document restates the brief in a build-friendly order: what to ship, what is out of scope, then domain rules, APIs, reliability, UI, verification, and submission.

---

## 1. Outcome

Ship a small full-stack app that:

1. Accepts **payment confirmations** over HTTP
2. Marks the related order as **paid**
3. Registers that order with a **simulated POS**
4. Exposes a **simple UI** to submit events, inspect orders, and retry failed POS sync

Correct, explainable behaviour beats extra features. Partial work is fine if unfinished areas are called out clearly.

---

## 2. Timebox & delivery expectations

| Expectation | Detail |
|-------------|--------|
| Delivery window | Within **48 hours** of receiving the brief |
| Effort target | About **3–4 hours**; stop at four |
| Extensions | Agree any extension **before** starting |
| Ambiguity | Ask early when blocked; for minor gaps, **document assumptions** and continue |
| Build order | Working **UI → backend → POS** path first, then duplicates, failures, and tests |
| Credit | Extras do **not** earn extra credit |

Declare approximate time spent and anything left unfinished in the main README.

---

## 3. Technical constraints

**Required**

- TypeScript end-to-end
- Node.js backend
- React (or another frontend framework) for the UI
- Monorepo with separate apps, e.g. `frontend/` and `backend/`
- HTTP between UI and API
- Business logic stays in the backend

**Sufficient / allowed**

- In-memory storage
- A single backend process
- Your own choices for internal architecture, state model, and concurrency

**Explicitly out of scope**

- Cloud deployment
- Real payment-provider integration
- Authentication
- Background job queues
- LLM features
- Partial refunds, provider refund calls, POS refund integration, and a dedicated refund UI

---

## 4. Money & payload conventions

- All amounts are **integer cents** (`price`, `total` — no unit suffixes in field names)
- `price` is the **per-item** unit price (`1200` → €12.00)
- Format as currency **only when displaying** in the UI
- Supported event type: `payment.succeeded` only
- Supported currency: `EUR` only
- Sender is treated as **trusted** (no auth layer)

Example payment event:

```json
{
  "eventId": "evt_001",
  "type": "payment.succeeded",
  "order": {
    "id": "ord_001",
    "venueId": "venue_001",
    "currency": "EUR",
    "items": [
      { "productId": "burger", "quantity": 2, "price": 1200 },
      { "productId": "water", "quantity": 1, "price": 250 }
    ],
    "total": 2650
  }
}
```

---

## 5. Backend behaviour

### 5.1 Accept payment — `POST /payment-events`

Validate, then:

1. Persist the order as **paid**
2. Attempt POS synchronisation
3. Keep **payment outcome** and **POS outcome** clearly distinct in stored/returned state

**Validation rules**

- Non-empty identifiers (`eventId`, order `id`, `venueId`, item `productId`)
- At least one line item
- Quantities: positive integers
- Amounts (`price`, `total`): nonnegative integers
- `total` must equal Σ(`quantity × price`)

### 5.2 Idempotency, conflicts, and POS failure

| Situation | Required behaviour |
|-----------|-------------------|
| Repeated delivery of the same event | No duplicate order; no duplicate POS transaction |
| Different `eventId`, same order | Same as above — still one order / one POS side effect |
| Concurrent deliveries | Same guarantees under concurrency |
| Conflicting payload for an existing order | Reject; leave order and POS record unchanged (comparing supplied items is enough) |
| POS sync fails | Order remains **paid**; sync must be **retryable** |

### 5.3 Inspect — `GET /orders/:orderId`

Return:

- Order details (items, totals, venue, currency)
- Payment status
- POS status
- POS attempt count
- POS transaction reference when present
- Refund fields when relevant

Unknown orders → appropriate HTTP error (e.g. `404`).

### 5.4 Retry sync — `POST /orders/:orderId/sync`

- Safely retry a failed synchronisation
- If already synced → **must not** create another POS transaction
- Handle unknown orders
- Handle overlapping retry attempts
- Document response behaviour in the project README

### 5.5 Refund — `POST /orders/:orderId/refund`

Simulated **full** refund only when the order is:

- Paid, and
- Successfully synced with the POS

Then:

- Record refunded amount and status
- Surface them on order lookup
- Repeated / concurrent refunds must not refund twice
- Later payment events must not clear refunded status
- Unknown or ineligible orders are rejected

---

## 6. Simulated POS

- Local async adapter/function (no second server required; API may await it directly)
- Map venue, order reference, items, currency, and total into a POS payload
- On acceptance, return a **transaction reference**
- **Deterministic failure**: first attempt for an order fails; a later retry succeeds
- Keep fake POS transactions **observable and separate** from order records so duplicate side effects can be asserted in tests
- Document how duplicates are prevented
- Timeouts *after* acceptance are outside scope

---

## 7. Frontend

One screen is enough; polish over spectacle.

| Capability | Notes |
|------------|-------|
| Payment form | Fields for event + order + line items; build the JSON payload from inputs (**no raw JSON editor**) |
| Resubmit | Same event/order can be submitted again to show duplicate handling |
| Lookup | Fetch by order ID |
| Display | Items, currency-formatted prices/total, payment + POS states, attempt count, POS reference |
| Retry | Trigger failed sync again and refresh displayed state so failure → recovery is obvious |
| UX basics | Labelled inputs, readable layout, loading indicators, success/error feedback, sensible disabled button states |

Refund UI is optional / out of scope for the brief; API-level refunds still required.

---

## 8. Verification

### Automated backend tests (required)

1. Valid event → paid order and eventually one POS transaction (via success path / retry as designed)
2. Duplicate delivery (including different event IDs) → no duplicate POS transaction
3. Overlapping requests → no duplicate transaction; the fake POS call must **actually overlap**
4. Failed POS attempt → payment preserved; retry succeeds; retry after success creates no extra transaction
5. Invalid total or conflicting order data → rejected without mutating existing records
6. Full refund → correct amount/status; duplicate/concurrent refunds are safe; replayed payment events keep refund; unknown/ineligible rejected

### Manual UI checklist (required)

Cover submission, duplicates, lookup, failure, and retry. Automated frontend tests are optional. Note any unfinished verification.

---

## 9. Repository & documentation

- Submit a **GitHub repo URL** (reviewer access, source, lockfiles, tests). A ZIP alone is not accepted.
- Prefer **meaningful incremental commits** with clear messages; push at sensible milestones (no fixed count or branching rules).
- README must cover: how to run both apps and tests, how to demo failure/retry and refunds, key decisions, unfinished work, time spent, git workflow, and what you would harden for production.
- Document AI assistance in `AI_USAGE.md` (or state that none was used). You must be able to explain, debug, and change all submitted code.

---

## 10. What reviewers care about most

Correctness and reliability, clear code, useful tests, usable basic UI, separation of responsibilities, and pragmatic trade-offs. Commit history is supporting evidence — behaviour and the ability to discuss/adapt the solution matter more. Expect a follow-up technical interview on the submitted code.
