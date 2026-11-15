---
name: otel-node
description: Set up or debug OpenTelemetry in a Node.js service, including compatible SDK/API versions, ESM load order, bundled auto-instrumentation, async context propagation and exporter verification. Use when adding instrumentation or investigating missing spans. See opentelemetry for signal and span design.
---

# OpenTelemetry — Node.js

Use Node 24+ and the project's existing build tools. Checked on 2026-11-16 with
SDK 3.1.1, sdk-node/exporter 0.301.2 and API 1.10.0. The
[smoke project](assets/smoke/package.json) pins the compatible package cohort.
SDK 2.x consumers keep API 1.9.x until migrating the SDK too; API and SDK majors
do not track each other. Read the [SDK 3 migration guide](https://github.com/open-telemetry/opentelemetry-js/blob/main/doc/3.x/migration-guide.md)
before upgrading an existing service.

## Initialize before application imports

```ts
// otel.ts — preload before the server entry point
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace';

const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    'service.name': process.env.OTEL_SERVICE_NAME ?? 'my-service',
  }),
  spanProcessors: [new BatchSpanProcessor({ exporter: new OTLPTraceExporter() })],
});
sdk.start();
process.once('SIGTERM', () => { void sdk.shutdown(); });
```

Load with `node --import ./otel.ts server.ts` on Node 24, or preload the compiled
`.js` module. Configure OTLP through its standard environment variables.
`OTEL_EXPORTER_OTLP_ENDPOINT` is a base URL; the trace-specific
`OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` is a full endpoint URL. Avoid appending
`/v1/traces` twice. Include shutdown in the service's existing graceful-stop path
so pending exports finish before process termination.

SDK 3 uses `resourceFromAttributes`, `spanProcessors` and
`new BatchSpanProcessor({ exporter })`. Do not copy the SDK 1/2 constructor
examples into this cohort. `@opentelemetry/sdk-trace` replaces the old
sdk-trace-base/node/web packages. `NodeSDK.start()` handles global registration;
the API exposes `trace.getTracer()`, not a `NodeSDK.getTracerProvider()` method.

## Instrumentation and ESM

Add instrumentations only for modules the service uses, keeping their peer
requirements compatible with the SDK cohort. Register them through
`NodeSDK({ instrumentations: [...] })` before importing the application.

Unbundled ESM can be instrumented using the package's documented loader hook.
Consult the resolved instrumentation release and the
[official ESM instructions](https://opentelemetry.io/docs/languages/js/getting-started/nodejs/).
CJS require hooks and ESM loader hooks are different mechanisms.

An esbuild/Vite/SWC bundle can inline the target modules and bypass both hooks.
This is a packaging-specific limitation, not proof that all ESM instrumentation
is unsupported. Reproduce against the actual output. Keep instrumented dependencies
external where supported, run unbundled with the proper hook, or add explicit
spans at a stable application boundary. Switching output to CJS alone does not
restore module boundaries that the bundler already erased.

## Explicit request boundary

[instrumentation.ts](assets/smoke/instrumentation.ts) contains a tested SDK factory
and `incomingSpan(tracer, headers, routeName, operation)`. It converts Web
`Headers` to a text carrier, passes the extracted context as the third
`startActiveSpan` argument, awaits work, records errors and always ends the span.

Use a declared route such as `GET /users/:id`, not the concrete URL containing
an ID. In a Hono/Express handler, pass that route pattern and run the handler's
async work inside the callback. Add stable semantic attributes such as
`http.request.method`, `http.route` and `http.response.status_code`; do not mark
an HTTP 5xx as successful merely because the handler returned normally.

For outgoing Web requests, inject into a plain carrier and merge it into the
request headers:

```ts
import { context, propagation } from '@opentelemetry/api';
const carrier: Record<string, string> = {};
propagation.inject(context.active(), carrier);
const headers = new Headers(existingHeaders);
for (const [name, value] of Object.entries(carrier)) headers.set(name, value);
await fetch(url, { headers });
```

For gRPC metadata, supply a setter that calls `metadata.set(key, value)`.
Neither a Web `Headers` instance nor gRPC metadata is a plain text carrier by
default. Check parent span IDs across the boundary, not just span counts.

## Verify the pipeline

```sh
pnpm --dir assets/smoke install --frozen-lockfile --ignore-scripts
pnpm --dir assets/smoke check
pnpm --dir assets/smoke test
```

The local test makes no collector/model requests. It verifies an incoming remote
parent, async child context, outgoing `traceparent`, error status/event, ended
spans and shutdown export. The old initialization fails compilation against the
current cohort. This does not prove a live collector or a bundled service works.
For that, temporarily add the Collector's `debug` exporter, send a request through
the built service and inspect the resulting trace IDs before removing the debug
exporter. Separate exporter/authentication failures from missing instrumentation.

Related: `opentelemetry` for signal design and `cloudflare-workers-otel-utels`
for Workers-specific instrumentation.
