---
name: translate-programming-language
description: Plan and execute language-to-language server or application migrations with behavior parity. Use when porting modules, services, APIs, or runtimes between programming languages; generating source-runtime oracles and fixtures; generating migrated parity tests; detecting runtime, standard-library, serialization, numeric, encoding, time, regex, or protocol differences; building temporary compatibility layers; accumulating migration knowledge; benchmarking; shadow testing; canarying; or planning cutover and rollback.
---

# Translate Programming Language

Use this skill to migrate production server/application code from one language/runtime to another without losing externally observable behavior. Preserve parity first, then simplify toward the target language after the old runtime is removed.

## Core Rules

- Treat the source runtime as the initial oracle, but check a public standard when one exists.
- Never hand-write expected fixtures. Generate them from a pinned source runtime or a standards-conformance harness.
- Keep reusable migration docs free of domain-specific names, URLs, schemas, customers, or product facts.
- Put language/runtime quirks in a compatibility layer, not in domain logic.
- Attach every compatibility layer to a deletion plan: source behavior, target behavior, standard/spec reference, callers, and post-cutover migration target.
- Do not trust unit parity alone. Verify with shadow/replay traffic and production-shaped benchmarks before switching.

## Workflow

1. **Scope the migration boundary**
   - Choose a narrow contract: function, module, endpoint, message type, or protocol handler.
   - Inventory inputs, outputs, side effects, state, clocks, randomness, locale, environment variables, filesystem/network usage, and error behavior.
   - Decide whether the externally visible contract is byte-exact, structurally equivalent, or semantically equivalent.

2. **Generate oracles**
   - Read [oracle-driven-parity.md](references/oracle-driven-parity.md).
   - Pin the source runtime and dependency versions.
   - Generate fixture outputs from the source implementation for ordinary cases, boundary values, malformed inputs, errors, and side effects.
   - When a standard exists, add standard-derived cases and record where source/target runtimes diverge.

3. **Generate migrated tests**
   - Read [test-migration.md](references/test-migration.md).
   - Generate target-language parity test stubs from source tests, test names, data providers, examples, or API contracts.
   - Make unfinished stubs visible in CI, then replace them with fixture-driven tests until skip/pending count reaches zero.
   - Add branch-oriented cases around every discovered language/runtime difference.

4. **Accumulate migration knowledge**
   - Read [compatibility-knowledge.md](references/compatibility-knowledge.md).
   - Maintain a living catalog of cross-language differences: numeric casts, truthiness, arrays/maps/order, JSON, URL encoding, regex, time, crypto, binary protocols, HTTP, exceptions, and concurrency.
   - For each difference, document source behavior, target behavior, standard behavior if available, the chosen compatibility decision, tests, and deletion path.

5. **Port domain code**
   - Port leaf/pure modules first, then shared helpers, then I/O adapters, then orchestration/endpoint code.
   - Keep domain code readable in the target language while routing legacy quirks through compatibility helpers.
   - Prefer structured parsers, official protocol libraries, and generated code over ad hoc string manipulation.
   - Refactor only after parity is proven; otherwise keep changes traceable to a source behavior.

6. **Verify in real environments and switch**
   - Read [rollout-and-cutover.md](references/rollout-and-cutover.md).
   - Run full parity gates, source fixture regeneration checks, generated-test drift checks, race/static checks, and benchmarks.
   - Use replay or shadow traffic to compare real requests/responses, logs, metrics, headers, binary payloads, and side effects.
   - Canary gradually with explicit rollback thresholds, then leave the old runtime available for at least one rollback window.

## Release Gates

Do not call the migration ready until all applicable gates pass:

- Source oracle regeneration produces no unexpected fixture diff.
- Generated parity-test stubs are in sync with source tests/contracts.
- Pending/skip parity tests are zero and failures are zero.
- Compatibility knowledge has an entry for every intentional runtime difference.
- Build, lint/static analysis, race/concurrency checks, and security checks pass.
- Benchmarks show no unacceptable latency, throughput, allocation, or resource regression.
- Shadow/replay/canary comparison meets the agreed diff threshold.
- Rollback path is tested and the old runtime remains deployable for the rollback window.

## Reporting Template

Use this shape in PR bodies, design notes, or migration status reports:

```markdown
## Scope
- Source boundary:
- Target boundary:
- Contract level: byte-exact / structural / semantic

## Oracle
- Source runtime/dependency versions:
- Fixture generation command:
- Standard/spec references:
- Boundary classes covered:

## Test Migration
- Source tests/contracts discovered:
- Generated stubs:
- Pending parity tests:
- Drift checks:

## Compatibility Knowledge
- New runtime differences:
- Compatibility helpers added:
- Deletion plan:

## Verification
- Unit/parity:
- Race/static/build:
- Benchmarks:
- Shadow/replay:
- Canary:
- Rollback:
```
