import assert from "node:assert/strict";
import test from "node:test";

const worker = await import("../dist/worker.mjs");
const telemetryRuntime = await import("../src/telemetry-runtime.mjs");

const TEMP_AUTH_BEARER = "test-private-bearer";

function tempAuthHeaders(headers = {}) {
  return {
    authentication: `Bearer ${TEMP_AUTH_BEARER}`,
    "x-mnemo-github-id": "12345",
    "x-mnemo-github-login": "mizchi",
    ...headers,
  };
}

function createExecutionContext() {
  const waits = [];
  return {
    waits,
    waitUntil(promise) {
      waits.push(Promise.resolve(promise));
    },
  };
}

function createTelemetryEnv(pushes, env = {}) {
  return {
    OTEL_EXPORTER_OTLP_ENDPOINT: "https://otel.example",
    OTEL_SERVICE_NAME: "mnemo-test",
    OTEL_SERVICE_VERSION: "test-version",
    DEPLOY_ENV: "test",
    __MNEMO_TELEMETRY_FETCH: async (input, init = {}) => {
      pushes.push({
        input,
        method: init.method,
        headers: init.headers,
        body: JSON.parse(init.body),
      });
      return new Response(null, { status: 202 });
    },
    ...env,
  };
}

function createUtelsEnv(pushes, env = {}) {
  return {
    UTELS_ENDPOINT: "https://api.utels.dev/__utels?v=1",
    UTELS_PROJECT_ID: "mnemo-server",
    UTELS_INGEST_TOKEN: "test-ingest-token",
    OTEL_SERVICE_VERSION: "test-version",
    DEPLOY_ENV: "test",
    __MNEMO_UTELS_FETCH: async (input, init = {}) => {
      pushes.push({
        input,
        method: init.method,
        headers: init.headers,
        body: JSON.parse(init.body),
      });
      return new Response(null, { status: 204 });
    },
    ...env,
  };
}

function otlpValue(value) {
  if ("stringValue" in value) return value.stringValue;
  if ("intValue" in value) return Number(value.intValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("boolValue" in value) return value.boolValue;
  return undefined;
}

function keyValuesToObject(items = []) {
  return Object.fromEntries(
    items.map((item) => [item.key, otlpValue(item.value)]),
  );
}

function getPush(pushes, path) {
  return pushes.find((push) => push.input === `https://otel.example${path}`);
}

test("telemetry is disabled when no OTLP endpoint is configured", async () => {
  const pushes = [];
  const ctx = createExecutionContext();
  const res = await worker.default.fetch(
    new Request("https://mnemo-server.test/health"),
    {
      __MNEMO_TELEMETRY_FETCH: async () => {
        pushes.push("unexpected");
        return new Response(null, { status: 202 });
      },
    },
    ctx,
  );

  assert.equal(res.status, 200);
  assert.equal(ctx.waits.length, 0);
  assert.equal(pushes.length, 0);
});

test("telemetry pushes request traces and metrics through waitUntil", async () => {
  const pushes = [];
  const ctx = createExecutionContext();
  const res = await worker.default.fetch(
    new Request("https://mnemo-server.test/health", {
      headers: {
        traceparent:
          "00-11111111111111111111111111111111-2222222222222222-01",
      },
    }),
    createTelemetryEnv(pushes),
    ctx,
  );

  assert.equal(res.status, 200);
  assert.ok(ctx.waits.length >= 2);
  await Promise.all(ctx.waits);

  const tracePush = getPush(pushes, "/v1/traces");
  const metricsPush = getPush(pushes, "/v1/metrics");
  assert.ok(tracePush, "trace payload is sent");
  assert.ok(metricsPush, "metrics payload is sent");
  assert.equal(tracePush.method, "POST");
  assert.equal(tracePush.headers["content-type"], "application/json");

  const resourceAttrs = keyValuesToObject(
    tracePush.body.resourceSpans[0].resource.attributes,
  );
  assert.equal(resourceAttrs["service.name"], "mnemo-test");
  assert.equal(resourceAttrs["service.version"], "test-version");
  assert.equal(resourceAttrs["deployment.environment"], "test");

  const span =
    tracePush.body.resourceSpans[0].scopeSpans[0].spans[0];
  assert.equal(span.name, "GET /health");
  assert.equal(span.kind, 2);
  assert.equal(span.traceId, "11111111111111111111111111111111");
  assert.equal(span.parentSpanId, "2222222222222222");
  assert.match(span.spanId, /^[0-9a-f]{16}$/);
  const spanAttrs = keyValuesToObject(span.attributes);
  assert.equal(spanAttrs["http.request.method"], "GET");
  assert.equal(spanAttrs["http.route"], "/health");
  assert.equal(spanAttrs["http.response.status_code"], 200);

  const metrics =
    metricsPush.body.resourceMetrics[0].scopeMetrics[0].metrics;
  assert.ok(metrics.some((metric) => metric.name === "http.server.requests"));
  assert.ok(
    metrics.some((metric) => metric.name === "http.server.request.duration"),
  );
});

test("telemetry emits an error span and log for 5xx responses", async () => {
  const pushes = [];
  const ctx = createExecutionContext();
  const res = await worker.default.fetch(
    new Request("https://mnemo-server.test/v1/search", {
      method: "POST",
      headers: tempAuthHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({ query: "moonbit" }),
    }),
    createTelemetryEnv(pushes, {
      MNEMO_TEMP_AUTH_BEARER: TEMP_AUTH_BEARER,
    }),
    ctx,
  );

  assert.equal(res.status, 503);
  await Promise.all(ctx.waits);

  const tracePush = getPush(pushes, "/v1/traces");
  const logsPush = getPush(pushes, "/v1/logs");
  assert.ok(tracePush, "trace payload is sent");
  assert.ok(logsPush, "log payload is sent for 5xx");

  const span =
    tracePush.body.resourceSpans[0].scopeSpans[0].spans[0];
  assert.equal(span.status.code, 2);
  assert.equal(span.status.message, "HTTP 503");

  const logRecord =
    logsPush.body.resourceLogs[0].scopeLogs[0].logRecords[0];
  assert.equal(logRecord.severityText, "ERROR");
  assert.equal(otlpValue(logRecord.body), "http.server.error");
  assert.equal(logRecord.traceId, span.traceId);
  assert.equal(logRecord.spanId, span.spanId);
  const logAttrs = keyValuesToObject(logRecord.attributes);
  assert.equal(logAttrs["http.route"], "/v1/search");
  assert.equal(logAttrs["http.response.status_code"], 503);
});

test("utels tracking is disabled until endpoint, project and token are configured", async () => {
  const pushes = [];
  const ctx = createExecutionContext();
  const handler = telemetryRuntime.withUtelsErrorTracking({
    async fetch() {
      return new Response("boom", { status: 500 });
    },
  });

  const res = await handler.fetch(
    new Request("https://mnemo-server.test/v1/search", { method: "POST" }),
    {
      __MNEMO_UTELS_FETCH: async () => {
        pushes.push("unexpected");
        return new Response(null, { status: 204 });
      },
    },
    ctx,
  );

  assert.equal(res.status, 500);
  assert.equal(ctx.waits.length, 0);
  assert.equal(pushes.length, 0);
});

test("utels tracking captures 5xx responses through waitUntil", async () => {
  const pushes = [];
  const ctx = createExecutionContext();
  const res = await worker.default.fetch(
    new Request("https://mnemo-server.test/v1/search", {
      method: "POST",
      headers: tempAuthHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({ query: "moonbit" }),
    }),
    createUtelsEnv(pushes, {
      MNEMO_TEMP_AUTH_BEARER: TEMP_AUTH_BEARER,
    }),
    ctx,
  );

  assert.equal(res.status, 503);
  assert.ok(ctx.waits.length >= 1);
  await Promise.all(ctx.waits);

  assert.equal(pushes.length, 1);
  assert.equal(pushes[0].input, "https://api.utels.dev/__utels?v=1");
  assert.equal(pushes[0].method, "POST");
  assert.equal(pushes[0].headers.authorization, "Bearer test-ingest-token");
  assert.equal(pushes[0].headers["content-type"], "application/json");
  assert.equal(pushes[0].body.v, 1);
  assert.equal(pushes[0].body.projectId, "mnemo-server");
  assert.equal(pushes[0].body.events.length, 1);

  const event = pushes[0].body.events[0];
  assert.equal(event.name, "exception");
  assert.equal(event.handled, true);
  assert.equal(event.mechanism, "manual");
  assert.equal(event.severity, "error");
  assert.equal(event.release, "test-version");
  assert.equal(event.buildId, "test");
  assert.equal(event["exception.type"], "HttpServerError");
  assert.equal(event["exception.message"], "POST /v1/search returned HTTP 503");
  assert.match(event.rawFingerprint, /HttpServerError\|POST \/v1\/search returned HTTP 503/);
  assert.equal(event.breadcrumbs[0].category, "http");
  assert.equal(event.breadcrumbs[0].data.route, "/v1/search");
  assert.equal(event.breadcrumbs[0].data.status, 503);
});

test("utels tracking captures thrown exceptions and rethrows", async () => {
  const pushes = [];
  const ctx = createExecutionContext();
  const handler = telemetryRuntime.withUtelsErrorTracking({
    async fetch() {
      throw new TypeError("forced failure");
    },
  });

  await assert.rejects(
    () =>
      handler.fetch(
        new Request("https://mnemo-server.test/v1/platform"),
        createUtelsEnv(pushes),
        ctx,
      ),
    /forced failure/,
  );
  assert.ok(ctx.waits.length >= 1);
  await Promise.all(ctx.waits);

  const event = pushes[0].body.events[0];
  assert.equal(event.handled, false);
  assert.equal(event.mechanism, "uncaughtException");
  assert.equal(event.severity, "fatal");
  assert.equal(event["exception.type"], "TypeError");
  assert.equal(event["exception.message"], "forced failure");
  assert.match(event["exception.stacktrace"], /forced failure/);
  assert.equal(event.breadcrumbs[0].data.route, "/v1/platform");
});
