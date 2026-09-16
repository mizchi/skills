# Parity Verification & Cutover (Phase 7)

Unit tests inside MoonBit prove the port compiles and matches your fixtures. They do **not** prove the contract holds for real consumers. Verify against the original test suite and real traffic before switching. For the full gate discipline, load `translate-programming-language`.

## 1. Run the original TypeScript test suite against the built artifact

This is the highest-signal gate: the tests written for the TS implementation, run unchanged against the MoonBit-built `.js`.

- Repoint the test import from the TS source to the build output:
  ```ts
  // before: import { parse } from "../src/index";
  import { parse } from "../_build/js/release/build/pkg.js";
  ```
  Prefer a path alias / `tsconfig` `paths` or a single barrel module so you flip the source in one place.
- Run the suite (`vitest`, `jest`, `node --test`, whatever the project uses).
- Green = the public behavior matches for every case the original authors cared about.

If the suite imports deep internal modules that no longer exist in MoonBit, that's expected — only the **public-API tests** are the contract. Quarantine internal-only tests; they were testing the old implementation, not the contract.

## 2. Fixture parity

Re-run the Phase 0 `contract/fixtures.json` pairs through the built artifact and assert by contract level:

| Level | Assertion |
|---|---|
| byte-exact | `output === expected` (string/bytes equality) |
| structural | deep-equal ignoring key order; or canonical-JSON compare |
| semantic | round-trip: `serialize(parse(x))` equals canonical form |

Cover the boundary cases you generated: empty, 0, `2^53 ± 1`, non-ASCII, NUL/high-bit bytes, malformed input, and every error path. Numeric and byte/text mistakes surface here.

## 3. Error-contract parity

Confirm the *shape* of failure matches, not just success:

- A thrown `Error` still throws, with the same `message` (or documented change).
- A rejected `Promise` still rejects (not resolves with an error value, or vice-versa).
- A returned result object keeps its `{ok, error}` shape.

## 4. Shadow / replay (services)

For a ported Node service (typically on `mizchi/x`):

- Mirror real requests to both the TS and MoonBit implementations; diff responses, status codes, headers, and side effects (files written, messages emitted).
- Run a production-shaped benchmark — check latency, throughput, and resource use against the TS baseline. A correct-but-slow port can still be a regression.

## 5. Cutover

- Canary a small traffic slice with explicit rollback thresholds on error rate and the diff metric.
- Keep the TypeScript implementation deployable for at least one rollback window after switching.
- Only after the window closes (and the `.d.ts` diff is clean) retire the TS source.

## Release gates checklist

Do not call the migration done until:

- [ ] Generated `.d.ts` matches the Phase 0 snapshot (or every diff is documented).
- [ ] Original public-API test suite passes against the built `.js`.
- [ ] All fixture pairs pass at their declared contract level; pending/skip = 0.
- [ ] Error/async/format contract verified (throws-vs-rejects, ESM-vs-CJS).
- [ ] Numeric boundaries (2^53, 32-bit wrap) and byte/text cases covered.
- [ ] `moon check`, `moon test`, `moon fmt` clean.
- [ ] Shadow/replay diff within threshold and benchmarks show no unacceptable regression (services).
- [ ] Rollback path tested; TS implementation still deployable for the rollback window.
