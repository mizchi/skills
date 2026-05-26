---
name: cloudflare-mbt-worker-bundle
description: Bundle a Cloudflare Worker that combines MoonBit core code with a TypeScript entry. Use when wrangler must ship a moon-built JS module alongside hand-written TS, with FFI rewrites and a post-build bundle check.
---

# Cloudflare Workers + MoonBit bundle pipeline

The canonical way to ship a Cloudflare Worker where the bulk of the request handler is MoonBit code (compiled to JS via `moon build --target js --release`) but the entry shim is hand-written TypeScript.

## When to invoke

Use when you're:
- Setting up a new MoonBit → Cloudflare Workers project.
- Migrating an existing project from a hand-written `dist/worker.mjs` shim to wrangler-native TS bundling.
- Diagnosing a Worker that hangs on the first `await` after startup (FFI rewrite missed; see references).

## Key facts about wrangler + MoonBit

1. **wrangler bundles TS natively.** As of wrangler 4.x, `main: "src/worker.ts"` in `wrangler.jsonc` is enough — wrangler's built-in esbuild integration transpiles + bundles + emits a single JS file on every `wrangler dev` / `wrangler deploy`. No separate `tsc` emit step is needed for the worker.
2. **MoonBit output is plain ESM JS.** `moon build --target js --release` writes `_build/js/release/build/<package>.js`. wrangler can `import` it from a TS entry — no bridging needed except for the side-effect import (the moon module registers globals at module init).
3. **Two MoonBit-specific source rewrites are mandatory.** These are not optional and cannot move into TS:
   - `moonbitlang$async$internal$event_loop$$reschedule()` → the mangled `_M0FP...event__loop10reschedule()` name. The legacy hook only drains the deque once; the new name re-pumps via `setTimeout(0)`. Without the rewrite, every `await` past startup hangs.
   - Module-scope random seed → a constant. Workers reject random in module init.
   Both must happen between `moon build` and `wrangler deploy`, applied to the moon JS output. See `assets/scripts/prepare-worker.ts.template`.

## Pipeline shape

```
clean → db:verify → vite build (if frontend) → moon build → prepare-worker → wrangler deploy
                                                            ↓
                                                            (writes src/_generated/<pkg>-core.js
                                                             with FFI rewrites applied; wrangler's
                                                             esbuild picks it up as part of the src/ tree)
```

For a project without frontend / FFI rewrites (no MoonBit), the pipeline is even simpler: `wrangler deploy` against `src/worker.ts` is sufficient. The starter kit `cloudflare-starterkit-mbt` ships with a slim version of this.

## What's in here

### `assets/templates/worker.ts.template`

A minimal `src/worker.ts` entry that:
1. Side-effect imports the prepared moon core (registers `globalThis.__appServerFetch`).
2. Imports telemetry + utels wrappers from `./telemetry-runtime.ts`.
3. Exports `{ fetch, scheduled }` for wrangler.

Rename `__appServerFetch` to match your moon module's `register_cloudflare_fetch` call.

### `assets/scripts/prepare-worker.ts.template`

The pre-bundle step. Reads moon output, applies the two FFI rewrites with `requiredReplace` (fails loudly if the target string isn't found — silent no-op was a real production hang), writes to `src/_generated/<pkg>-core.js`.

### `assets/scripts/check-worker-bundle.ts`

Post-build sanity check on the final bundle. Catches:
- Stray `\x1f` control bytes (wasm-host text corruption, sqlc-gen-moonbit #17 family).
- Bundle too small (moon emitted a stub).
- Required markers missing (extend `REQUIRED_MARKERS` per project — e.g. `globalThis.__appCronTick` for scheduled handlers).

### `assets/templates/wrangler.jsonc.template`

Skeleton with `env.staging` block, the `name`/`main`/`compatibility_date` shape, and inline comments on where to paste D1 IDs / R2 / Vectorize bindings.

## Why this pipeline (over alternatives)

| Alternative | Trade-off |
| --- | --- |
| Pre-bundle everything to `dist/` with `tsc` + a hand-written `worker.mjs` shim | Used to be required before wrangler 4 TS support. Adds a separate emit + a shim file to maintain. Drop in favor of wrangler-native bundling unless you have a niche need to inspect `dist/`. |
| Use Vite as the bundler | Works for non-Worker code. For Workers the runtime constraints (no setTimeout > 0, no module-init random, no eval in some paths) need wrangler's awareness. Sticking with wrangler's esbuild is safer. |
| Drop MoonBit, write the worker fully in TS | Loses the typed handler / mars routing / static check guarantees. Use when MoonBit isn't already on the team. |

## References

- [`references/wrangler-traps.md`](references/wrangler-traps.md) — `deployments list` ordering, the nonexistent `--yes` flag, etc.
- [`references/moonbit-ffi-rewrites.md`](references/moonbit-ffi-rewrites.md) — what each rewrite does, why, and how to recognize when one stops landing.

## Source

The runtime reference is in [`mizchi/cloudflare-starterkit-mbt`](https://github.com/mizchi/cloudflare-starterkit-mbt). A larger example with the FFI rewrites + editor-assets runtime is in [`mizchi/mnemo`](https://github.com/mizchi/mnemo) under `mnemo-server/`.
