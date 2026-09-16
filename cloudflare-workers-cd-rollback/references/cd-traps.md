# Cloudflare Workers + wrangler + GitHub Actions trap collection

Each entry below cost a debugging session at least once. Read before spending an afternoon chasing the symptom.

## 1. Int64 D1 bind hang → 1101 Worker threw exception

**Symptom**: a route involving a D1 query with an `INTEGER` column never returns. After ~30s Cloudflare kills the worker with `1101`.

**Root cause**: D1's `.bind()` does not handle JS `BigInt`. Passing a raw BigInt makes `.run()` / `.all()` never resolve. sqlc-gen-moonbit emits `Int64` fields as BigInt at the bind boundary.

**Fix**: every `@core.any(params.<Int64>)` in `src/db/gen/sqlc_queries.mbt` must be wrapped with `int64_bind_safe(...)`. `scripts/patch-int64-binds.ts` does this post-`sqlc generate`. `--verify` is a CI gate (`pnpm run db:verify`).

**Pitfall in the patch script itself**: an earlier version used `\{[^}]+\}` as the function-body matcher in a single regex. That truncates whenever the bind list contains an Optional field encoded as `(match params.x { Some(v) => @core.any(v); None => @core.null() })` — every bind after the inner `}` was silently skipped. The current script splits on `^pub async fn ` boundaries instead so the body match cannot truncate. Also wraps the `Some(v) => @core.any(v)` arm for `Int64?` fields — the unwrapped `v` is still BigInt.

## 2. SQL placeholder mix (`?` with `sqlc.arg(...)`)

**Symptom**: a query with anonymous `?` mixed with `sqlc.arg(...)` returns `Worker threw exception` 1101 on requests that hit it.

**Root cause**: sqlc-gen-moonbit compiles each `sqlc.arg('name')` to a fixed `?N` and leaves anonymous `?` for SQLite to auto-number (`max used + 1`). When both styles co-exist, a trailing anonymous `?` can land on a number beyond the bind-array length. D1 returns a parameter count mismatch which surfaces as a worker exception.

**Fix**: pick one style per statement. `scripts/check-sql-placeholder-mix.ts` enforces it on `pnpm run db:verify`. The starter ships using `sqlc.arg(...)` everywhere.

## 3. sqlc-gen-moonbit codegen bit-flips

**Symptom**: `moon check` reports `pub stquct UpsertGroupParams { ... }` is invalid. Looks like a typo in `src/db/gen/sqlc_types.mbt` — except you didn't edit it.

**Root cause**: the wasm host running sqlc plugins occasionally emits 1-bit-flipped characters in the generated output. `struct` → `stquct`, `String` → `Strjng`, etc. Cause is somewhere in the wasm sandbox layer; not deterministic.

**Fix**: patch by hand and re-run `sqlc generate` to confirm it stays clean. Track recurring spots in a checklist; if the same identifier flips multiple times, consider adding a post-gen sed step.

## 4. Cloudflare `1101 Worker threw exception` is not always a runtime crash

Cloudflare returns 1101 whenever the worker's fetch handler throws or hangs. The HTML body says "Worker threw exception" but the real cause may be:

- A unique-constraint violation in D1 (`INSERT` without `ON CONFLICT`) — the throw escapes the request handler because there's no try/catch around `runStatement`.
- A BigInt bind that hangs `.run()` past the request timeout.
- A `Promise` returned from an extern JS function that was never awaited (rare; usually fails at type-check first).

Always **query D1 directly** before believing the message. `wrangler d1 execute <name> --remote --command 'SELECT ...'` rules out half-writes faster than guessing.

## 5. `wrangler deployments list` ordering

**v4 ordering is OLDEST FIRST**. The most recent deploy is the LAST entry, not the first. Take it with `awk 'END { print last }'`, not `head -n1`.

## 6. `wrangler d1 migrations apply --yes` does not exist

`--yes` is silently rejected as an unknown option, wrangler prints help and exits 1. In CI the prompt is auto-skipped without any flag. Just don't pass it.

## 7. GitHub Actions step name with colon-space

```yaml
- name: "Note: no rollback target on first deploy"  # quoted ✓
- name: Note: no rollback target on first deploy    # unquoted → entire workflow file becomes invalid
```

The unquoted form makes GitHub fall back to the file path as the display name and reject `workflow_dispatch` with "no trigger found".

## 8. Default `bash -e` kills the step before `rc=$?` capture

If you want to inspect a non-zero exit instead of letting the step die immediately:

```yaml
- run: |
    set +e         # lift errexit
    set -uo pipefail
    some-command > /tmp/out 2>&1
    rc=$?
    # …branch on $rc / grep /tmp/out…
```

## 9. `${{ github.event.head_commit.message }}` is unsafe in shell context

Commit bodies are user-supplied multi-line text. Substituting them into a shell `msg="${{ ... }}"` assignment can leak shell metachars: a commit body containing `--yes` or `wrangler` will be parsed as separate shell tokens. Pass `${{ github.sha }}` instead; the deploy step adds a short sha to the message already, so commit subject is preserved by git anyway.

## 10. Pulumi cloudflare v6.x lacks `VectorizeIndex`

You'll provision D1 / R2 / Access via Pulumi and then have to create Vectorize indexes by hand:

```sh
pnpm exec wrangler vectorize create cf-mbt-app-vectors --dimensions=768 --metric=cosine
```

The Pulumi stack outputs the matching command as `vectorizeCreateCommandOut` so it's a single copy-paste.

## 11. `dotenvx set` is space-separated

```sh
pnpm exec dotenvx set CLOUDFLARE_API_TOKEN abc123 -f .env.cloudflare   # ✓
pnpm exec dotenvx set CLOUDFLARE_API_TOKEN=abc123  -f .env.cloudflare  # ✗ "missing required argument 'value'"
```

## 12. Fast-forward push to a fresh branch may skip paths-filtered workflows

When you create a new `release` branch with the same tip as `main`, the path-filtered `on: push: paths: [...]` workflows can see "no diff" and skip. Trigger the first production deploy via `gh workflow run deploy --ref release -f environment=production` once; subsequent commits onto release trigger normally.
