# Payment idempotency

- For the same `requestId`, external PSP charge may happen at most once.
- Retry is allowed, but later attempts return the existing charge result.
