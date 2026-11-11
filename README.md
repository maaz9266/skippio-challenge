# Skippio Engineering Challenge

Small full-stack app that accepts payment confirmation events, registers paid orders with a **simulated POS**, and provides a UI to inspect, retry sync, and (optionally) refund.

**Repo:** https://github.com/maaz9266/skippio-challenge  
**Time spent:** ~2 hours

## Structure

```text
backend/     Node.js + Express + TypeScript (business logic, in-memory store)
frontend/    Vite + React + TypeScript (demo UI)
CHALLENGE_ANSWERS.md   Brief → implementation map
AI_USAGE.md
MANUAL_TESTING.md
```

## Prerequisites

- Node.js 20+
- npm

## Setup

```bash
cd backend && npm install
cd ../frontend && npm install
```

## Run

```bash
# terminal 1 — API on http://localhost:3001
cd backend && npm run dev

# terminal 2 — UI on http://localhost:3000 (proxies /api → backend)
cd frontend && npm run dev
```

Production-style start after build:

```bash
cd backend && npm run build && npm start
cd frontend && npm run build && npm run preview
```

## Tests & checks

```bash
cd backend && npm test && npm run typecheck && npm run build
cd frontend && npm run typecheck && npm run build
```

## Demo flows

### POS failure → retry (UI)

1. Open http://localhost:3000  
2. Submit the sample payment event → order is **paid**, POS **failed**, attempt **1**  
3. Click **Retry POS sync** → POS **synced**, transaction reference set  
4. Resubmit the same event → **duplicate** ACK, no extra POS transaction  

### Duplicates

Resubmit the same form values, or change only `eventId` with the same order data → `200` + existing order; POS transaction count stays `1` after a successful sync.

### Lookup

Enter an order ID and **Look up** (or use the order returned from submit).

### Refund (API or UI)

Eligible only when **paid** and POS **synced**:

```bash
curl -s -X POST http://localhost:3001/orders/ord_001/refund | jq
curl -s http://localhost:3001/orders/ord_001 | jq
```

UI: **Refund order** when eligible. Repeat → `409`.

### Sync response behaviour

| Case | HTTP |
|------|------|
| Sync ok / already synced | 200 (`alreadySynced: true` when applicable) |
| POS rejected (still paid) | 200 with `ok: false`, `posStatus: failed` |
| Sync in progress | 409 + `inProgress` |
| Unknown order | 404 |

## Architecture (short)

- **Payment vs POS vs refund** are separate fields (`paymentStatus`, `posStatus`, `refundStatus`).
- Money is **integer cents** everywhere; UI formats EUR only for display.
- POS adapter is a local async function: attempt 1 fails, attempt ≥2 succeeds; accepted txs live in a separate `posTransactions` map.
- **Idempotency:** processed `eventId` map + order-id match/conflict checks.
- **Concurrency:** set `posStatus` to `syncing` synchronously before any POS `await`.

More detail: `CHALLENGE_ANSWERS.md`.

## Git workflow

Incremental commits on `main`, pushed at milestones (scaffold → domain → payment → POS → duplicates → concurrency → orders → refunds/UI → docs).

## Unfinished / out of scope

Nothing required by the brief is knowingly incomplete. Optional extras: refund button and `/dev` debug panel.

## AI

See `AI_USAGE.md`.
