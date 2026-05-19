# MoonBit FFI rewrites for Cloudflare Workers

Two source rewrites that `prepare-worker.ts` applies to the moon JS output between `moon build --target js --release` and `wrangler deploy`. Both are not optional for Cloudflare Workers.

## Rewrite 1: event_loop reschedule rename

**Before**: `moonbitlang$async$internal$event_loop$$reschedule();`
**After**: `_M0FP411moonbitlang5async8internal11event__loop10reschedule();`

### Why

moonbitlang/async (the async runtime MoonBit code uses) renamed the recursive event-loop reschedule entry point. The legacy `coroutine.reschedule()` only drains the deque **once** — it does not re-arm the event loop. The new `event__loop.reschedule()` re-pumps via `setTimeout(0)`.

In the unrewritten moon output, after the first batch of awaited Promises resolves, no further work runs. The Worker `fetch` handler is stuck waiting for a Promise that will never resolve, until Cloudflare kills the isolate at the 30-second wall.

### How to recognize this regressing

Symptoms when the rewrite stops landing:
- New deploys hang on the first request after a `pnpm install` that bumped `moonbitlang/async`.
- `wrangler tail` shows the request entering and never exiting.
- `pnpm run dev` works locally (different moonbitlang/async transformation in dev mode), but `wrangler deploy` produces a hanging Worker.

`requiredReplace` in `prepare-worker.ts` fails loudly if the legacy name isn't present — that's the primary defense.

### What to do if the mangled target changes

`moonbitlang/async` may rename the mangled function again. The script's `requiredReplace` will then fail with "expected to find: ..." pointing at the OLD name. To find the new mangled name:

```bash
moon build --target js --release
grep -o '_M0FP[0-9]\+moonbitlang5async[0-9a-z_]\+reschedule' _build/js/release/build/<pkg>.js | sort -u
```

Take the one that ends in `reschedule` and update the `after` argument of the `requiredReplace` call.

## Rewrite 2: module-scope random seed

**Before**: `const _M0FPB4seed = _M0FPB12random__seed();`
**After**: `const _M0FPB4seed = 0x6d6e656d;`

### Why

Cloudflare Workers reject random number generation in module global scope. MoonBit uses this seed for runtime hashing — it's evaluated at module load time, which Workers refuse to allow.

A deterministic seed is acceptable for the Worker because all random I/O lives inside request handlers anyway (where Workers does permit `crypto.getRandomValues` etc.). The hashing only needs a stable starting point.

### What to do if `_M0FPB` changes

The `_M0FPB` prefix is the mangled name for MoonBit's runtime package. If MoonBit renames the runtime package, the mangling changes. Find the new name:

```bash
grep -n "const _M0FP[A-Z]*seed = _M0FP" _build/js/release/build/<pkg>.js
```

Update both the search and replacement strings together.

## Why these rewrites live in JS rewriting (not MoonBit FFI)

You can't FFI your way out of these inside MoonBit because they're not function calls in your source — they're emitted by the moonbitlang/async runtime and the moon compiler's prelude. The only place to fix them is the produced JS, before wrangler bundles it.

## Cross-reference

- The same patterns appear in [`mizchi/mnemo`](https://github.com/mizchi/mnemo/blob/main/mnemo-server/scripts/prepare-worker.mjs) and [`docs/regression/worker-deploy.md`](https://github.com/mizchi/mnemo/blob/main/mnemo-server/docs/regression/worker-deploy.md) trap 1.
