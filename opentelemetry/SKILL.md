---
name: opentelemetry
description: Platform-agnostic OpenTelemetry reference — signal selection (traces/metrics/logs), span design, context propagation (W3C TraceContext), sampling strategies, and OTLP exporter config. Use before writing any OTel instrumentation to get design decisions right. Platform-specific skills (otel-node, cloudflare-workers-otel-utels) layer on top of this.
---

# OpenTelemetry — Core Patterns

JavaScript examples use Node 24+ and the SDK 3.x/API 1.10 generation, checked
on 2026-11-16. SDK 2.x requires API 1.9.x; do not upgrade only the API package.
See the [SDK 3 migration guide](https://github.com/open-telemetry/opentelemetry-js/blob/main/doc/3.x/migration-guide.md)
and the tested example in `otel-node` before choosing package versions.

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
  "db.system.name": "sqlite",
  "db.operation.name": "SELECT",
  "db.collection.name": "users",
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
const ctx = propagation.extract(context.active(), Object.fromEntries(request.headers));
tracer.startActiveSpan("handle request", {}, ctx, (span) => {
  try {
    // Do synchronous work here. For async work, await it before ending the span.
  } finally {
    span.end();
  }
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
import { BatchSpanProcessor, TracerProvider } from "@opentelemetry/sdk-trace";
import { trace } from "@opentelemetry/api";

const exporter = new OTLPTraceExporter({
  // Or use OTEL_EXPORTER_OTLP_TRACES_ENDPOINT for a signal-specific full URL.
  url: "https://collector.example.com/v1/traces",
});

const provider = new TracerProvider({
  spanProcessors: [new BatchSpanProcessor({
    exporter,
    maxQueueSize: 512,
    scheduledDelayMillis: 2000,
    exportTimeoutMillis: 10_000,
  })],
});
trace.setGlobalTracerProvider(provider);
```

Use `BatchSpanProcessor` to batch production exports. `SimpleSpanProcessor`
exports each ended span separately; it does not inherently imply a synchronous
network request. Flush/shut down the provider before process exit. For Node,
prefer `NodeSDK`, which also configures context propagation and resource detection.

## Common Pitfalls

- **Provider never installed**: start `NodeSDK`, or explicitly install the tracer provider, context manager and propagator before application imports. SDK 3's `TracerProvider` has no old `register()` step.
- **ESM + auto-instrumentation (Node.js)**: supported unbundled ESM needs the instrumentation loader hook. Bundled dependencies can bypass module hooks; see `otel-node`.
- **Cloudflare Workers**: a Workers isolate with partial Node compatibility still needs an exporter and instrumentation suited to that runtime. See `cloudflare-workers-otel-utels`.
- **Span name includes dynamic data**: explodes trace index cardinality. Move to attributes.
- **No W3C propagation on outbound calls**: distributed trace breaks — downstream spans appear as orphaned roots.
