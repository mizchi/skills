---
name: otel-node
description: Node.js OpenTelemetry setup — SDK init, auto-instrumentation packages, and the esbuild ESM silent-failure gotcha (instrumentation-* packages produce no spans when bundled with esbuild --format=esm). Use when adding OTel to a Node.js/Hono/Express service or debugging missing spans after bundling. See devops/opentelemetry for signal design decisions.
---

# OpenTelemetry — Node.js

## SDK Initialization

```typescript
// otel.ts — import before everything else
import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { Resource } from "@opentelemetry/resources";
import { SEMRESATTRS_SERVICE_NAME } from "@opentelemetry/semantic-conventions";

const exporter = new OTLPTraceExporter({
  url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT + "/v1/traces",
});

export const sdk = new NodeSDK({
  resource: new Resource({
    [SEMRESATTRS_SERVICE_NAME]: process.env.SERVICE_NAME ?? "my-service",
  }),
  spanProcessor: new BatchSpanProcessor(exporter),
});

sdk.start();
process.on("SIGTERM", () => sdk.shutdown());
```

Load before the app entry: `node --import ./otel.js server.js` or `tsx --import ./otel.ts server.ts`.

## Auto-instrumentation packages

Add only what you need — each package patches a specific module:

```bash
pnpm add @opentelemetry/instrumentation-http       # node:http / node:https
pnpm add @opentelemetry/instrumentation-express    # Express routing spans
pnpm add @opentelemetry/instrumentation-pg         # postgres queries
pnpm add @opentelemetry/instrumentation-ioredis    # Redis commands
```

Register in SDK init:

```typescript
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { ExpressInstrumentation } from "@opentelemetry/instrumentation-express";

export const sdk = new NodeSDK({
  instrumentations: [new HttpInstrumentation(), new ExpressInstrumentation()],
  // ...
});
```

**Hono**: no official instrumentation package. Use manual middleware (see below).

## esbuild ESM — Silent Auto-Instrumentation Failure

### Symptom

App starts normally, SDK init log appears, but **no spans arrive at the collector**. No errors. Happens when:

- Output format is `--format=esm`
- Using `@opentelemetry/instrumentation-*` auto-instrumentation
- Bundler is esbuild (also Vite / SWC — same root cause)

### Root cause

`@opentelemetry/instrumentation-*` uses `require-in-the-middle` to hook `require()` and monkey-patch target modules (`node:http` etc.). In an esbuild ESM bundle, `import` is resolved statically at bundle time — `require()` is never called at runtime → hook never fires → no patches → no spans. No error is raised (silent failure).

### Fix A — Manual spans (recommended for Hono/esbuild)

Write a middleware that creates spans explicitly:

```typescript
import { context, propagation, SpanKind, SpanStatusCode, trace } from "@opentelemetry/api";

const tracer = trace.getTracer("app");

app.use(async (c, next) => {
  const ctx = propagation.extract(context.active(), c.req.raw.headers);
  const route = new URL(c.req.url).pathname;

  await tracer.startActiveSpan(
    `${c.req.method} ${route}`,
    { kind: SpanKind.SERVER, attributes: { "http.method": c.req.method, "http.route": route } },
    ctx,
    async (span) => {
      try {
        await next();
        span.setAttribute("http.status_code", c.res.status);
        span.setStatus({ code: SpanStatusCode.OK });
      } catch (e: any) {
        span.recordException(e);
        span.setStatus({ code: SpanStatusCode.ERROR, message: e?.message });
        throw e;
      } finally {
        span.end();
      }
    }
  );
});
```

Propagate context to outgoing gRPC calls via metadata:

```typescript
const callUnary = (method, req) => {
  const metadata = new grpc.Metadata();
  propagation.inject(context.active(), metadata, {
    set: (carrier, key, value) => (carrier as grpc.Metadata).set(key, value),
  });
  return new Promise((resolve, reject) =>
    client[method](req, metadata, (err, res) => (err ? reject(err) : resolve(res)))
  );
};
```

### Fix B — Switch to CJS output

Change esbuild to `--format=cjs`. `require()` hook fires normally. Works when no ESM-only dependencies are present. Hono supports CJS.

### Fix C — Run unbundled

Use `tsx` or `node --loader ts-node/esm` + `--import @opentelemetry/auto-instrumentations-node/register`. Skip bundling for the Node process. Increases container image size; not recommended for production.

## Verifying the Pipeline

Add a debug exporter to the OTel Collector temporarily:

```yaml
exporters:
  debug:
    verbosity: detailed

service:
  pipelines:
    traces:
      receivers: [otlp]
      exporters: [otlphttp/tempo, debug]
```

Collector logs show `Trace ID: ... Name: GET /api/users` when spans arrive. No output = broken before the collector.

## Related

- `devops/opentelemetry` — signal design, span naming, sampling, W3C propagation
- `cloudflare/workers-otel-utels` — Cloudflare Workers telemetry (no Node runtime, fetch-boundary approach)
- esbuild + Vite + SWC all share the same `require-in-the-middle` failure mode
- `instrumentation-*` packages do not support static import patching as of 2026-05
