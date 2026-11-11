# AI usage

AI tools were used during this exercise (Cursor agent / Composer).

## How AI was used

- Phased implementation against `cursor_phased_build_guide.md` and `REQUIREMENTS.md`
- Scaffolding frontend/backend, domain types, payment validation, POS adapter, idempotency, concurrency guards, refunds, UI, and tests
- Drafting docs (`README.md`, `CHALLENGE_ANSWERS.md`, this file)

## What was reviewed / changed by a human

- Architecture and phase gates approved before edits
- Behaviour checked via Vitest, curl, and the UI (fail → retry, duplicates, parallel sync/refund)
- Rejected or corrected AI suggestions when wrong (e.g. auto-unsync before parallel sync races — reverted; double-200 after sync is correct idempotent behaviour)
- Style preference: arrow functions

## Verification of AI output

- `cd backend && npm test` (includes brief six-group coverage)
- Backend/frontend `typecheck` + `build`
- Manual UI demos and `/dev` store inspection
