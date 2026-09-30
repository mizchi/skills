---
name: cloudflare-workers-otel-utels
description: Cloudflare Worker telemetry at the fetch boundary — OTLP traces / metrics / logs + utels error tracking + D1 Proxy that emits slow-query warnings. Use when adding observability to a Worker without touching handler code.
---

# Cloudflare Workers OTel + utels boundary

Two wrappers that compose around a Worker's `{fetch, scheduled}` handler. Both are no-op pass-throughs unless their env vars are present, so you can run with neither, just one, or both.

```
withUtelsErrorTracking(withTelemetry(coreHandler))
```

- `withTelemetry` — OTLP traces / metrics / logs push when any `OTEL_EXPORTER_OTLP_*` endpoint is configured. Also wraps every D1 binding with a Proxy that logs `event: "d1.slow_query"` for Workers Logs in the dashboard, **even without OTLP**, so the slow-query story works on a fresh deploy.
- `withUtelsErrorTracking` — pushes one `exception` event per 5xx response or thrown exception to a [utels.dev](https://utels.dev) project. The endpoint, project ID, and ingest token are env-configured.

## When to invoke

Use when you're:
- Standing up observability on a new Worker, want OTLP-compatible traces and metrics to any backend (Honeycomb, Grafana Cloud, Tempo, Jaeger collector, …).
- Adding server-side error tracking via utels without changing handler code.
- Investigating a slow query: drop the threshold env var and inspect Workers Logs in the dashboard.

## What's in here

### `assets/scripts/telemetry-runtime.ts`

Copy this file and `d1-wrap.ts` together into `src/`; the runtime imports `./d1-wrap.ts`. It exports `withTelemetry` and `withUtelsErrorTracking` and is bundled by `cf build` through the Cloudflare Vite plugin.

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

```typescript
// cloudflare.config.ts: merge these into worker.env.
import { bindings } from "cf/config";
const telemetryBindings = {
  OTEL_SERVICE_NAME: bindings.text("my-app"),
  OTEL_SERVICE_VERSION: bindings.text("0.1.0"),
  DEPLOY_ENV: bindings.text("production"),
  UTELS_ENDPOINT: bindings.text("https://utels.dev/__utels?v=1"),
  UTELS_PROJECT_ID: bindings.text("my-app-prod"),
  UTELS_RELEASE: bindings.text("0.1.0"),
  // Declare only the secrets for enabled integrations:
  // OTEL_EXPORTER_OTLP_ENDPOINT: bindings.secret(),
  // OTEL_EXPORTER_OTLP_HEADERS: bindings.secret(),
  // UTELS_INGEST_TOKEN: bindings.secret(),
};
```

Choose mode-specific service/project names for staging. Supply local secret values in `.dev.vars`; deployment values go in an ignored JSON or dotenv file. Declared secret bindings are required during deploy validation. Values decrypted into the CLI process with dotenvx are not automatically Worker bindings.

```bash
pnpm exec cf workers types
pnpm exec cf deploy --dry-run --secrets-file .env.production
pnpm exec cf deploy --secrets-file .env.production
```

For direct utels registration and secret delivery without argv/log exposure, use [utels-project-bootstrap](../utels-project-bootstrap/SKILL.md). The checked cf beta has no live-log streaming; use Workers Logs in the dashboard or the OTLP backend to inspect `d1.slow_query` events.

Disable individually with `OTEL_SDK_DISABLED=true` or `UTELS_DISABLED=true`.

## Slow-query independence

`withTelemetry` always wraps D1 bindings with the Proxy. Even when OTLP is unconfigured, every query whose duration crosses `APP_D1_SLOW_THRESHOLD_MS` (default 250ms) gets logged as a structured `console.warn` visible in Workers Logs. This works independently of OTLP configuration.

## References

- [telemetry-runtime.ts](assets/scripts/telemetry-runtime.ts) — OTLP encoders and utels exception payload construction.
- [telemetry.test.ts](assets/tests/telemetry.test.ts) — payload assertions to adapt to the copied project's build layout.
- [cf configuration](../cloudflare-deploy/references/cf/configuration.md) — bindings, modes and secret delivery.

## Source

The runtime is based on [`mizchi/cloudflare-starterkit-mbt`](https://github.com/mizchi/cloudflare-starterkit-mbt/blob/main/src/telemetry-runtime.ts) and [`mizchi/mnemo`](https://github.com/mizchi/mnemo/blob/main/mnemo-server/src/telemetry-runtime.ts), with the sibling import adapted for the bundled assets.
