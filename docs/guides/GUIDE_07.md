# Handle a failed carrier call

Keep the booking request unconfirmed, store a safe failure event and allow a retry with an idempotency key.

## Verify before launch
Run tests, inspect logs, confirm the UI status matches real provider state, and document the rollback plan.
