# Manual testing checklist

Run backend (`:3001`) and frontend (`:3000`), then:

- [x] Submit a valid payment event → paid + POS failed (attempt 1)
- [x] Look up order → still paid, POS failed
- [x] Retry POS sync → synced + transaction reference
- [x] Resubmit same event → duplicate, no extra POS transaction
- [x] Conflicting order data → rejected; existing record unchanged (API / tests)
- [x] Invalid total → rejected (API / tests)
- [x] Unknown order lookup / sync → 404 (API / tests)
- [x] Refund eligible order → refunded amount = total
- [x] Repeat refund → not applied twice
- [x] Replay payment after refund → refund preserved
- [x] Loading / success / error feedback visible in UI
- [ ] Full browser console / backend log sweep on a clean run (optional before handoff)

Automated frontend tests: not added (optional per brief).
