---
name: sqlc-gen-moonbit-safety
description: Post-generation safety checks for sqlc-gen-moonbit + Cloudflare D1. Use when a MoonBit Worker uses sqlc-gen-moonbit and you need to gate against BigInt-bind hangs (D1 1101) and SQL placeholder mix.
---

# sqlc-gen-moonbit safety gates

Two regression-defense scripts that any sqlc-gen-moonbit + Cloudflare D1 project should run on every codegen and in CI. Both come from real production bugs in `mizchi/mnemo` that took an afternoon each to debug.

## When to invoke

Use when you're:
- Bootstrapping a project that uses `sqlc-gen-moonbit` against Cloudflare D1.
- Investigating a 1101 (Worker threw exception) that may be a D1 `.bind()` hang.
- Adding a `pnpm run db:verify` gate (or equivalent) for sqlc codegen output.

## What's in here

### `assets/scripts/patch-int64-binds.ts`

Post-`sqlc generate` patch that wraps every `@core.any(params.<Int64-field>)` in `src/db/gen/sqlc_queries.mbt` with `int64_bind_safe(...)`. The wrapper coerces JS BigInt → Number before D1 `.bind()`.

**Why this is needed**: D1's `.bind()` does not handle BigInt. Passing a raw BigInt makes `.run()` / `.all()` never resolve. After ~30 s Cloudflare kills the worker with a `1101 Worker threw exception`. sqlc-gen-moonbit emits `Int64` fields as BigInt at the bind boundary by default.

**Two modes**:
- `--apply` (default): rewrite the file in place. Wire into `db:generate` so it runs after every `sqlc generate`.
- `--verify`: exit non-zero if any Int64 bind site is still unwrapped. Wire into CI / `db:verify` to catch a regression where someone hand-edited the gen file or the patch step was skipped.

**Implementation notes**:
- Block-based parsing (`source.split(/^(?=pub async fn )/m)`). The earlier single-regex implementation used `\{[^}]+\}` as the body matcher, which silently truncated whenever the bind list contained `(match params.x { Some(v) => @core.any(v); None => @core.null() })` — every bind after the inner `}` was skipped. The block split avoids that.
- Handles both `Int64` (direct `@core.any(params.f)`) and `Int64?` (the `Some(v) => @core.any(v)` arm gets wrapped too — `v` is still BigInt).
- Friendly to fresh repos: skips cleanly when `src/db/gen/sqlc_queries.mbt` doesn't exist yet (so `db:verify` doesn't block before the first `db:generate`).

### `assets/scripts/check-sql-placeholder-mix.ts`

Rejects `-- name:` statements in `db/sqlite/query.sql` that mix anonymous `?` with `sqlc.arg(...)`.

**Why this is needed**: sqlc-gen-moonbit compiles each `sqlc.arg('name')` to a fixed `?N` and leaves anonymous `?` for SQLite to auto-number ("max used + 1"). When both styles co-exist, a trailing anonymous `?` can land on a number higher than the bind-array length. D1 then errors out, surfaced as a 1101.

**Rule**: pick one style per statement. The recommended style for sqlc-gen-moonbit is `sqlc.arg(...)` everywhere.

### `assets/tests/patch-int64-binds.test.ts`

Reference test pattern: spins up a tmpdir project with synthetic `sqlc_types.mbt` + `sqlc_queries.mbt`, runs the script with `node:child_process`, asserts the bind wrap landed. Includes a regression case for the nested-brace bug so the block-based parser stays in place.

## Suggested wiring

```jsonc
// package.json
{
  "scripts": {
    "db:generate": "sqlc generate && node scripts/patch-int64-binds.ts",
    "db:verify": "node scripts/patch-int64-binds.ts --verify && node scripts/check-sql-placeholder-mix.ts"
  }
}
```

`db:verify` should fire in CI (and ideally in the build pipeline) so a regen drift can't ship.

## References

- [`references/d1-bind-hang.md`](references/d1-bind-hang.md) — the BigInt → 1101 chain in detail, including how to recognize it from a `wrangler tail` session.

## Source

The current versions live in [`mizchi/cloudflare-starterkit-mbt`](https://github.com/mizchi/cloudflare-starterkit-mbt) under `scripts/`. The starter's CI runs both as `pnpm run db:verify`. mnemo (the origin of these patterns) also runs them.
