# D1 BigInt-bind hang → Cloudflare 1101

## Symptom

A route that touches an `INTEGER` column never returns. `wrangler tail` shows the request enter the handler. After ~30 s Cloudflare kills the isolate with:

```
1101 Worker threw exception
```

The HTML body says "Worker threw exception" but no stack ever reaches your logs.

## Root cause

D1's `db.prepare(...).bind(...)` does not handle JS `BigInt`. The bind call accepts the value but `.run()` / `.all()` / `.first()` never resolve — the Promise is silently stuck.

sqlc-gen-moonbit emits `Int64` fields as BigInt at the JS bind boundary:

```moonbit
let stmt = db.prepare(create_item_sql).bind([
  @core.any(params.id),
  @core.any(params.owner_user_id),
  @core.any(params.created_at),   // ← Int64 = BigInt at runtime
])
```

The `@core.any(<Int64>)` cast preserves the BigInt all the way to D1. There is no error; the Worker just hangs until the Cloudflare runtime hits its 30 s wall-clock limit and kills the isolate.

## Fix

Wrap every Int64 / Int64? bind with a `int64_bind_safe` JS helper that coerces to Number:

```moonbit
extern "js" fn int64_bind_safe(value : Int64) -> @core.Any =
  #| (v) => typeof v === "bigint" ? Number(v) : v;
```

The post-`sqlc generate` script `patch-int64-binds.ts` rewrites every `@core.any(params.<Int64>)` to `@core.any(int64_bind_safe(params.<Int64>))`. For `Int64?` fields it rewrites the `Some(v) => @core.any(v)` arm of the match too — `v` is still BigInt.

## Pitfall in the patch script itself

An earlier version used a single regex with `\{[^}]+\}` as the function-body matcher. That truncates whenever the bind list contains an Optional field encoded as:

```moonbit
(match params.x { Some(v) => @core.any(v); None => @core.null() })
```

Every `@core.any(params.<Int64>)` after that inner `}` was silently skipped — and worse, the `--verify` mode used the same regex, so it reported OK with 14 bind sites unwrapped.

Block-based parsing (`source.split(/^(?=pub async fn )/m)`) avoids the truncation. Use it.

## How to recognize this from a tail log

Without telemetry: the only signal is a request that never returns. A `wrangler tail` will show the request entering the handler, then silence, then nothing until the CF runtime kills it.

With telemetry: the `withTelemetry` D1 Proxy wrap (`cloudflare-workers-otel-utels` skill) records per-query duration in a `finally`. A query that never reaches `finally` because `.run()` never resolves is a smoking gun for this class of bug.

## Verification gate

```bash
node scripts/patch-int64-binds.ts --verify
```

Should run in CI and as part of `pnpm run db:verify`. If a hand-edited or stale `sqlc_queries.mbt` has unwrapped Int64 binds, exit code 1.
