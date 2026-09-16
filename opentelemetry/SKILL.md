---
name: opentelemetry
description: Platform-agnostic OpenTelemetry reference — signal selection (traces/metrics/logs), span design, context propagation (W3C TraceContext), sampling strategies, and OTLP exporter config. Use before writing any OTel instrumentation to get design decisions right. Platform-specific skills (devops/otel-node, cloudflare/workers-otel-utels) layer on top of this.
---

# OpenTelemetry — Core Patterns

## Signal Selection

Pick the right signal before writing code:

| Signal | Use for | Cost |
|---|---|---|
| **Traces** | Request lifecycle, latency attribution, distributed causality | High (per-request) |
| **Metrics** | Aggregated counts, rates, histograms — dashboards and alerting | Low (pre-aggregated) |
| **Logs** | Discrete events with context — errors, audit, debug | Medium |

Rule of thumb: metrics answer "how often / how fast", logs answer "what happened", traces answer "why". Don't use traces where metrics suffice.

## Span Design

### Naming convention

```
<verb> <noun>         →  "fetch user", "send email"
<provider>.<operation> →  "db.query", "http.get", "cache.set"
```

Never put variable data (IDs, values) in the span name — use attributes. A span name is a cardinality key in your trace index.

### Attributes

```typescript
span.setAttributes({
  "db.system": "sqlite",
  "db.operation": "select",
  "db.sql.table": "users",
  "user.id": userId,          // high-cardinality: OK as attribute, not in name
});
```

Follow [OpenTelemetry Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/) for well-known attribute names (`http.*`, `db.*`, `rpc.*`, etc.) — backends and APMs key off these.

### Events vs child spans

- **Event**: instant point-in-time inside the current operation (`span.addEvent("cache_miss")`)
- **Child span**: has its own duration, latency matters, useful in trace waterfall

### Status and exceptions

```typescript
span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
span.recordException(err);  // adds exception.type / exception.message / exception.stacktrace
```

Call **both** on error. `recordException` alone does not flip status to ERROR — the span appears successful in the UI.

### Guarantee `span.end()`

```typescript
// ✓ callback form guarantees end()
tracer.startActiveSpan("operation", (span) => {
  try {
    return doWork();
  } catch (e) {
    span.recordException(e as Error);
    span.setStatus({ code: SpanStatusCode.ERROR });
    throw e;
  } finally {
    span.end();
  }
});
```

A span that is never ended leaks in the processor queue and may never export.

## Context Propagation

W3C TraceContext (`traceparent` / `tracestate`) is the standard. Inject on outgoing requests, extract on incoming:

```typescript
import { propagation, context } from "@opentelemetry/api";

// Outgoing HTTP
const carrier: Record<string, string> = {};
propagation.inject(context.active(), carrier);
fetch(url, { headers: carrier });

// Incoming (server handler)
const ctx = propagation.extract(context.active(), request.headers);
tracer.startActiveSpan("handle request", { context: ctx }, (span) => {
  // span is now a child of the upstream trace
});
```

**Most common bug**: creating a span without extracting the incoming context → the trace waterfall breaks into disconnected root spans. Always extract before starting the root server span.

## Sampling

| Strategy | When |
|---|---|
| `AlwaysOn` | Dev / low-traffic staging |
| `TraceIdRatioBased(0.1)` | High-volume production — sample 10% of new traces |
| `ParentBased(root: TraceIdRatioBased)` | **Recommended default** — respects upstream decision, samples new roots at ratio |
| Tail sampling (OTel Collector) | Need 100% of errors regardless of head-sample decision |

`ParentBased` prevents the failure mode where the upstream samples a trace but the downstream drops it (broken waterfall).

## OTLP Exporter Config

```typescript
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";

const exporter = new OTLPTraceExporter({
  url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT + "/v1/traces",
  headers: { Authorization: `Bearer ${process.env.OTEL_API_KEY}` },
});

provider.addSpanProcessor(
  new BatchSpanProcessor(exporter, {
    maxQueueSize: 512,
    scheduledDelayMillis: 2000,
    exportTimeoutMillis: 10_000,
  })
);
```

Use `BatchSpanProcessor` in production — it is async and low-overhead. `SimpleSpanProcessor` blocks the event loop; use only for local debugging.

## Common Pitfalls

- **`provider.register()` not called**: SDK is configured but nothing is exported. Call before any instrumentation runs.
- **ESM + auto-instrumentation (Node.js)**: `require-in-the-middle` hooks do not fire for ESM static imports. See `devops/otel-node` for the workaround.
- **Cloudflare Workers**: no Node.js runtime, fetch-boundary instrumentation needed. See `cloudflare/workers-otel-utels`.
- **Span name includes dynamic data**: explodes trace index cardinality. Move to attributes.
- **No W3C propagation on outbound calls**: distributed trace breaks — downstream spans appear as orphaned roots.
