---
name: cloudflare-workers-otel-utels
description: Cloudflare Worker telemetry at the fetch boundary — OTLP traces / metrics / logs + utels error tracking + D1 Proxy that emits slow-query warnings. Use when adding observability to a Worker without touching handler code.
---

# Cloudflare Workers OTel + utels boundary

Two wrappers that compose around a Worker's `{fetch, scheduled}` handler. Both are no-op pass-throughs unless their env vars are present, so you can run with neither, just one, or both.

```
withUtelsErrorTracking(withTelemetry(coreHandler))
```

- `withTelemetry` — OTLP traces / metrics / logs push when any `OTEL_EXPORTER_OTLP_*` endpoint is configured. Also wraps every D1 binding with a Proxy that logs `event: "d1.slow_query"` to `wrangler tail`, **even without OTLP**, so the slow-query story works on a fresh deploy.
- `withUtelsErrorTracking` — pushes one `exception` event per 5xx response or thrown exception to a [utels.dev](https://utels.dev) project. The endpoint, project ID, and ingest token are env-configured.

## When to invoke

Use when you're:
- Standing up observability on a new Worker, want OTLP-compatible traces and metrics to any backend (Honeycomb, Grafana Cloud, Tempo, Jaeger collector, …).
- Adding server-side error tracking via utels without changing handler code.
- Investigating a slow query: drop the threshold env var and watch `wrangler tail`.

## What's in here

### `assets/scripts/telemetry-runtime.ts`

The whole runtime, ready to drop into `src/`. Exports `withTelemetry` and `withUtelsErrorTracking`. Bundled by wrangler's esbuild at deploy.

Hot points to customize per-project:

- **`DEFAULT_SERVICE_NAME`** — match your worker name.
- **`EXACT_ROUTES`** — the set of paths that should NOT be normalized to `"unmatched"`. Add your top-level routes.
- **`routeForPath(pathname)`** — extend to collapse `:id`-style path params. High-card route attributes will explode trace and metric label cardinality if you skip this.

### `assets/scripts/d1-wrap.ts`

The D1 Proxy wrap. Self-contained. Threads SQL templates through `prepare → bind` chains so the eventual terminal op (`first` / `run` / `all` / `raw`) records the right statement. Records `bindingName`, `op`, `sql`, `durationMs`, `ok`. Strongly typed; safe to use as the entry to type the rest of your telemetry pipeline.

Exports a `Recorder = (query: RecordedQuery) => void` so you can plug it into something other than the bundled `withTelemetry` if you have a different aggregation story.

### `assets/tests/d1-wrap.test.ts` and `telemetry.test.ts`

Reference tests. The d1-wrap test uses mock D1 bindings to validate the Proxy chain + slow-threshold + recorder shape. The telemetry test asserts that 5xx responses + thrown exceptions both produce utels events.

## Wiring

```typescript
// src/worker.ts
import { withTelemetry, withUtelsErrorTracking } from "./telemetry-runtime.ts";

const coreHandler = { fetch(req, env, ctx) { /* ... */ } };
const fetchHandler = withUtelsErrorTracking(withTelemetry(coreHandler));

export default {
  fetch: fetchHandler.fetch,
};
```

```jsonc
// wrangler.jsonc
{
  "vars": {
    "OTEL_SERVICE_NAME": "my-app",
    "OTEL_SERVICE_VERSION": "0.1.0",
    "DEPLOY_ENV": "production",
    // Optional utels
    "UTELS_ENDPOINT": "https://utels.dev/__utels?v=1",
    "UTELS_PROJECT_ID": "my-app-prod",
    "UTELS_RELEASE": "0.1.0"
  }
}
```

```bash
# Optional OTLP. Set any of these to enable trace/metric/log push.
pnpm exec dotenvx set OTEL_EXPORTER_OTLP_ENDPOINT https://api.honeycomb.io -f .env.cloudflare
pnpm exec dotenvx set OTEL_EXPORTER_OTLP_HEADERS "x-honeycomb-team=<key>" -f .env.cloudflare

# Optional utels ingest token (wrangler secret, not committed)
pnpm exec wrangler secret put UTELS_INGEST_TOKEN
```

Disable individually with `OTEL_SDK_DISABLED=true` or `UTELS_DISABLED=true`.

## Slow-query independence

`withTelemetry` ALWAYS wraps D1 bindings with the Proxy. Even when OTLP is unconfigured, every query whose duration crosses `APP_D1_SLOW_THRESHOLD_MS` (default 250ms) gets logged as a structured `console.warn` that `wrangler tail` picks up. This is the cheapest possible "is my query slow?" loop — works on day-one of a new deploy.

## References

- [`references/otlp-payload-shapes.md`](references/otlp-payload-shapes.md) — the exact shape of the traces/metrics/logs JSON the runtime emits, with notes on what each OTLP backend cares about.
- [`references/utels-event-shape.md`](references/utels-event-shape.md) — the `exception` event schema utels expects.

## Source

The runtime is identical to [`mizchi/cloudflare-starterkit-mbt`](https://github.com/mizchi/cloudflare-starterkit-mbt/blob/main/src/telemetry-runtime.ts) and [`mizchi/mnemo`](https://github.com/mizchi/mnemo/blob/main/mnemo-server/src/telemetry-runtime.ts).
