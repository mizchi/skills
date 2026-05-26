// Cloudflare Worker telemetry wrappers used at the generated worker
// entrypoint (dist/worker.mjs). Provides:
//   - `withTelemetry`: OTLP traces / metrics / logs push when an
//     OTEL_EXPORTER_OTLP_* endpoint is configured; runs D1 query
//     telemetry unconditionally so slow queries surface in
//     `wrangler tail` even without OTLP wired up.
//   - `withUtelsErrorTracking`: pushes one `exception` event per 5xx
//     response or thrown exception to a utels.dev project. Inert
//     unless `UTELS_ENDPOINT` + `UTELS_PROJECT_ID` + `UTELS_INGEST_TOKEN`
//     are all present.
//
// Both wrappers are intentionally side-effect-free toward the request
// path: every push goes through `schedule(ctx, …)` and swallows errors.
//
// Customize `routeForPath` below to match your URL surface — high-card
// path params like ":id" should be normalized so they don't blow up
// trace/metric cardinality. The starter ships with the bare minimum.

const DEFAULT_SERVICE_NAME = "cf-mbt-app";
const DEFAULT_SERVICE_VERSION = "0.1.0";
const SCOPE = { name: "cf-mbt-app.worker", version: DEFAULT_SERVICE_VERSION };
const HISTOGRAM_BUCKETS_MS = [
  5, 10, 25, 50, 75, 100, 250, 500, 750, 1000, 2500, 5000, 7500, 10000,
];

// Add the exact routes that should NOT be normalized to "unmatched".
// For everything else, edit `routeForPath` below.
const EXACT_ROUTES = new Set([
  "/",
  "/health",
]);

function nowNs() {
  return String(BigInt(Date.now()) * 1_000_000n);
}

function stringEnv(env, name) {
  const value = env?.[name];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function isDisabled(env) {
  const value = stringEnv(env, "OTEL_SDK_DISABLED") ??
    stringEnv(env, "APP_TELEMETRY_DISABLED");
  return value === "true" || value === "1";
}

function endpointFromBase(base, path) {
  if (!base) return undefined;
  const trimmed = base.replace(/\/+$/, "");
  return trimmed.replace(/\/v1\/(?:traces|metrics|logs)$/, "") + path;
}

function parseHeaders(value) {
  if (!value) return {};
  const headers = {};
  for (const part of value.split(",")) {
    const index = part.indexOf("=");
    if (index <= 0) continue;
    const key = part.slice(0, index).trim();
    const rawValue = part.slice(index + 1).trim();
    if (!key) continue;
    try {
      headers[key] = decodeURIComponent(rawValue);
    } catch {
      headers[key] = rawValue;
    }
  }
  return headers;
}

function telemetryConfig(env) {
  if (isDisabled(env)) return undefined;
  const baseEndpoint = stringEnv(env, "OTEL_EXPORTER_OTLP_ENDPOINT");
  const tracesEndpoint = stringEnv(env, "OTEL_EXPORTER_OTLP_TRACES_ENDPOINT") ??
    endpointFromBase(baseEndpoint, "/v1/traces");
  const metricsEndpoint = stringEnv(env, "OTEL_EXPORTER_OTLP_METRICS_ENDPOINT") ??
    endpointFromBase(baseEndpoint, "/v1/metrics");
  const logsEndpoint = stringEnv(env, "OTEL_EXPORTER_OTLP_LOGS_ENDPOINT") ??
    endpointFromBase(baseEndpoint, "/v1/logs");
  if (!tracesEndpoint && !metricsEndpoint && !logsEndpoint) return undefined;
  return {
    endpoints: {
      traces: tracesEndpoint,
      metrics: metricsEndpoint,
      logs: logsEndpoint,
    },
    headers: parseHeaders(stringEnv(env, "OTEL_EXPORTER_OTLP_HEADERS")),
    serviceName: stringEnv(env, "OTEL_SERVICE_NAME") ?? DEFAULT_SERVICE_NAME,
    serviceVersion: stringEnv(env, "OTEL_SERVICE_VERSION") ??
      DEFAULT_SERVICE_VERSION,
    deployEnv: stringEnv(env, "DEPLOY_ENV") ??
      stringEnv(env, "ENVIRONMENT") ??
      stringEnv(env, "NODE_ENV"),
  };
}

function randomHex(bytes) {
  const values = new Uint8Array(bytes);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(values);
  } else {
    for (let i = 0; i < values.length; i += 1) {
      values[i] = Math.floor(Math.random() * 256);
    }
  }
  return [...values].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function validNonZeroHex(value, length) {
  return typeof value === "string" &&
    value.length === length &&
    /^[0-9a-f]+$/i.test(value) &&
    !/^0+$/.test(value);
}

function traceContext(request) {
  const traceparent = request.headers.get("traceparent") ?? "";
  const match = traceparent.match(
    /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/i,
  );
  const spanId = randomHex(8);
  if (
    match &&
    validNonZeroHex(match[1], 32) &&
    validNonZeroHex(match[2], 16)
  ) {
    return {
      traceId: match[1].toLowerCase(),
      spanId,
      parentSpanId: match[2].toLowerCase(),
      traceFlags: match[3].toLowerCase(),
    };
  }
  return {
    traceId: randomHex(16),
    spanId,
    traceFlags: "01",
  };
}

// Route normalization. Override the body to collapse :id-style path
// params; otherwise high-cardinality routes will explode trace and
// metric labels. Returning "unmatched" for unknown paths is fine — it
// keeps the cardinality bounded.
function routeForPath(pathname) {
  if (EXACT_ROUTES.has(pathname)) return pathname;
  // Example pattern (uncomment / extend as needed):
  // const segments = pathname.split("/").filter(Boolean);
  // if (segments[0] === "v1" && segments[1] === "items" && segments.length === 3) {
  //   return "/v1/items/:id";
  // }
  return "unmatched";
}

function otlpValue(value) {
  if (typeof value === "boolean") return { boolValue: value };
  if (typeof value === "number") {
    return Number.isInteger(value)
      ? { intValue: String(value) }
      : { doubleValue: value };
  }
  return { stringValue: String(value) };
}

function toKeyValues(attrs) {
  return Object.entries(attrs)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => ({ key, value: otlpValue(value) }));
}

function resource(config) {
  return {
    attributes: toKeyValues({
      "service.name": config.serviceName,
      "service.version": config.serviceVersion,
      "deployment.environment": config.deployEnv,
    }),
  };
}

function bucketCounts(value) {
  const counts = new Array(HISTOGRAM_BUCKETS_MS.length + 1).fill(0);
  let index = HISTOGRAM_BUCKETS_MS.length;
  for (let i = 0; i < HISTOGRAM_BUCKETS_MS.length; i += 1) {
    if (value <= HISTOGRAM_BUCKETS_MS[i]) {
      index = i;
      break;
    }
  }
  counts[index] = 1;
  return counts.map(String);
}

function baseAttrs(request, url, route) {
  const attrs = {
    "http.request.method": request.method,
    "http.route": route,
    "url.scheme": url.protocol.replace(/:$/, ""),
    "url.path": url.pathname,
    "server.address": url.hostname,
  };
  const userAgent = request.headers.get("user-agent");
  if (userAgent) attrs["user_agent.original"] = userAgent;
  return attrs;
}

function tracePayload(
  config,
  ctx,
  attrs,
  startNs,
  endNs,
  status,
  error,
  childSpans = [],
) {
  const span: Record<string, unknown> = {
    traceId: ctx.traceId,
    spanId: ctx.spanId,
    ...(ctx.parentSpanId ? { parentSpanId: ctx.parentSpanId } : {}),
    name: `${attrs["http.request.method"]} ${attrs["http.route"]}`,
    kind: 2,
    startTimeUnixNano: startNs,
    endTimeUnixNano: endNs,
    attributes: toKeyValues(attrs),
  };
  if (status >= 500 || error) {
    span.status = {
      code: 2,
      message: error ? String(error.message ?? error) : `HTTP ${status}`,
    };
  }
  return {
    resourceSpans: [
      {
        resource: resource(config),
        scopeSpans: [{ scope: SCOPE, spans: [span, ...childSpans] }],
      },
    ],
  };
}

import {
  d1QuerySpan as _d1QuerySpan,
  d1SlowThreshold,
  detectDbOperation,
  detectDbTable,
  truncateStatement,
  wrapD1Bindings,
} from "./telemetry/d1-wrap.ts";

function d1QuerySpan(spanCtx, query) {
  return _d1QuerySpan(spanCtx, query, { toKeyValues, randomHex });
}

function metricsPayload(config, attrs, startNs, endNs, durationMs) {
  const attributes = toKeyValues(attrs);
  return {
    resourceMetrics: [
      {
        resource: resource(config),
        scopeMetrics: [
          {
            scope: SCOPE,
            metrics: [
              {
                name: "http.server.requests",
                unit: "1",
                sum: {
                  aggregationTemporality: 1,
                  isMonotonic: true,
                  dataPoints: [
                    {
                      attributes,
                      startTimeUnixNano: startNs,
                      timeUnixNano: endNs,
                      asInt: "1",
                    },
                  ],
                },
              },
              {
                name: "http.server.request.duration",
                unit: "ms",
                histogram: {
                  aggregationTemporality: 1,
                  dataPoints: [
                    {
                      attributes,
                      startTimeUnixNano: startNs,
                      timeUnixNano: endNs,
                      count: "1",
                      sum: durationMs,
                      explicitBounds: HISTOGRAM_BUCKETS_MS,
                      bucketCounts: bucketCounts(durationMs),
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
    ],
  };
}

function logPayload(config, ctx, attrs, endNs, error) {
  const logAttrs = {
    ...attrs,
    "error.type": error ? "exception" : "http_5xx",
  };
  if (error) {
    logAttrs["exception.type"] = error.name ?? "Error";
    logAttrs["exception.message"] = error.message ?? String(error);
    if (error.stack) logAttrs["exception.stacktrace"] = error.stack;
  }
  return {
    resourceLogs: [
      {
        resource: resource(config),
        scopeLogs: [
          {
            scope: SCOPE,
            logRecords: [
              {
                timeUnixNano: endNs,
                observedTimeUnixNano: endNs,
                severityNumber: 17,
                severityText: "ERROR",
                body: { stringValue: "http.server.error" },
                attributes: toKeyValues(logAttrs),
                traceId: ctx.traceId,
                spanId: ctx.spanId,
              },
            ],
          },
        ],
      },
    ],
  };
}

async function pushOtlp(endpoint, config, body, fetchImpl) {
  if (!endpoint || typeof fetchImpl !== "function") return;
  try {
    await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...config.headers,
      },
      body: JSON.stringify(body),
    });
  } catch {
    // Telemetry must never affect the request path.
  }
}

function schedule(ctx, promise) {
  if (typeof ctx?.waitUntil === "function") {
    ctx.waitUntil(promise);
  } else {
    promise.catch(() => {});
  }
}

function fetchImpl(env) {
  if (typeof env?.__APP_TELEMETRY_FETCH === "function") {
    return env.__APP_TELEMETRY_FETCH;
  }
  return globalThis.fetch;
}

function utelsFetchImpl(env) {
  if (typeof env?.__APP_UTELS_FETCH === "function") {
    return env.__APP_UTELS_FETCH;
  }
  return globalThis.fetch;
}

function isUtelsDisabled(env) {
  const value = stringEnv(env, "UTELS_DISABLED");
  return value === "true" || value === "1";
}

function normalizeUtelsEndpoint(value) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.pathname === "/" || url.pathname === "") {
      url.pathname = "/__utels";
    }
    if (!url.searchParams.has("v")) {
      url.searchParams.set("v", "1");
    }
    return url.toString();
  } catch {
    return undefined;
  }
}

function utelsConfig(env) {
  if (isUtelsDisabled(env)) return undefined;
  const endpoint = normalizeUtelsEndpoint(stringEnv(env, "UTELS_ENDPOINT"));
  const projectId = stringEnv(env, "UTELS_PROJECT_ID");
  const token = stringEnv(env, "UTELS_INGEST_TOKEN");
  if (!endpoint || !projectId || !token) return undefined;
  return {
    endpoint,
    projectId,
    token,
    release: stringEnv(env, "UTELS_RELEASE") ??
      stringEnv(env, "OTEL_SERVICE_VERSION") ??
      DEFAULT_SERVICE_VERSION,
    buildId: stringEnv(env, "UTELS_BUILD_ID") ??
      stringEnv(env, "DEPLOY_ENV") ??
      stringEnv(env, "ENVIRONMENT") ??
      "unknown",
    runtimeVersion: stringEnv(env, "UTELS_RUNTIME_VERSION") ??
      "cloudflare-workers",
  };
}

function topStackFrame(stacktrace) {
  return stacktrace?.split("\n").find((line) => line.trim().startsWith("at "));
}

function normalizeError(error, fallbackType, fallbackMessage) {
  if (error instanceof Error) {
    return {
      type: error.name || fallbackType,
      message: error.message || fallbackMessage,
      stacktrace: error.stack,
    };
  }
  if (typeof error === "string") {
    return { type: "NonError", message: error };
  }
  if (error !== undefined && error !== null) {
    try {
      return { type: "NonError", message: JSON.stringify(error) };
    } catch {
      return { type: "NonError", message: String(error) };
    }
  }
  return { type: fallbackType, message: fallbackMessage };
}

function utelsEvent(config, request, route, status, error, options) {
  const ts = Date.now();
  const eventId = globalThis.crypto?.randomUUID?.() ?? randomHex(16);
  const normalized = normalizeError(
    error,
    "HttpServerError",
    `${request.method} ${route} returned HTTP ${status}`,
  );
  const stackFrame = topStackFrame(normalized.stacktrace);
  return {
    name: "exception",
    eventId,
    ts,
    handled: options.handled,
    mechanism: options.mechanism,
    severity: options.severity,
    runtime: "node",
    runtimeVersion: config.runtimeVersion,
    release: config.release,
    buildId: config.buildId,
    sessionId: eventId,
    pageViewId: eventId,
    rawFingerprint: [
      normalized.type,
      normalized.message,
      stackFrame ?? route,
    ].filter(Boolean).join("|").slice(0, 512),
    "exception.type": normalized.type,
    "exception.message": normalized.message,
    ...(normalized.stacktrace
      ? { "exception.stacktrace": normalized.stacktrace }
      : {}),
    "error.type": normalized.type,
    breadcrumbs: [
      {
        ts,
        category: "http",
        level: status >= 500 ? "error" : "warning",
        message: `${request.method} ${route}`,
        data: {
          route,
          status,
        },
      },
    ],
  };
}

async function pushUtels(config, event, fetchImpl) {
  if (typeof fetchImpl !== "function") return;
  try {
    await fetchImpl(config.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.token}`,
      },
      body: JSON.stringify({
        v: 1,
        projectId: config.projectId,
        events: [event],
      }),
    });
  } catch {
    // Error tracking must never affect the request path.
  }
}

export function withTelemetry(handler) {
  return {
    async fetch(request, env, ctx) {
      const config = telemetryConfig(env);
      const url = new URL(request.url);
      const route = routeForPath(url.pathname);
      const spanCtx = traceContext(request);
      const startNs = nowNs();
      const startMs = globalThis.performance?.now?.() ?? Date.now();
      let status = 500;
      let error;

      const queries = [];
      const recorder = (q) => queries.push(q);
      const wrappedEnv = wrapD1Bindings(env, recorder);
      const slowThreshold = d1SlowThreshold(env);

      try {
        const response = await handler.fetch(request, wrappedEnv, ctx);
        status = response.status;
        return response;
      } catch (caught) {
        error = caught;
        throw caught;
      } finally {
        const endNs = nowNs();
        const endMs = globalThis.performance?.now?.() ?? Date.now();
        const durationMs = Math.max(0, endMs - startMs);
        const slowCount = queries.reduce(
          (n, q) => (q.durationMs >= slowThreshold ? n + 1 : n),
          0,
        );
        const maxDuration = queries.reduce(
          (m, q) => Math.max(m, q.durationMs),
          0,
        );
        const attrs = {
          ...baseAttrs(request, url, route),
          "http.response.status_code": status,
          "app.d1.query_count": queries.length,
          "app.d1.slow_count": slowCount,
          "app.d1.max_duration_ms": maxDuration,
        };
        const telemetryFetch = fetchImpl(env);

        for (const q of queries) {
          if (q.durationMs >= slowThreshold) {
            console.warn(JSON.stringify({
              event: "d1.slow_query",
              route,
              binding: q.bindingName,
              op: q.op,
              operation: detectDbOperation(q.sql),
              table: detectDbTable(q.sql),
              duration_ms: q.durationMs,
              statement: truncateStatement(q.sql),
              ok: q.ok,
            }));
          }
        }

        if (config) {
          const childSpans = queries.map((q) => d1QuerySpan(spanCtx, q));
          schedule(
            ctx,
            pushOtlp(
              config.endpoints.traces,
              config,
              tracePayload(
                config,
                spanCtx,
                attrs,
                startNs,
                endNs,
                status,
                error,
                childSpans,
              ),
              telemetryFetch,
            ),
          );
          schedule(
            ctx,
            pushOtlp(
              config.endpoints.metrics,
              config,
              metricsPayload(config, attrs, startNs, endNs, durationMs),
              telemetryFetch,
            ),
          );
          if (status >= 500 || error) {
            schedule(
              ctx,
              pushOtlp(
                config.endpoints.logs,
                config,
                logPayload(config, spanCtx, attrs, endNs, error),
                telemetryFetch,
              ),
            );
          }
        }
      }
    },
  };
}

export function withUtelsErrorTracking(handler) {
  return {
    async fetch(request, env, ctx) {
      const config = utelsConfig(env);
      if (!config) {
        return handler.fetch(request, env, ctx);
      }
      const url = new URL(request.url);
      const route = routeForPath(url.pathname);
      const send = (status, error, options) => {
        schedule(
          ctx,
          pushUtels(
            config,
            utelsEvent(config, request, route, status, error, options),
            utelsFetchImpl(env),
          ),
        );
      };
      try {
        const response = await handler.fetch(request, env, ctx);
        if (response.status >= 500) {
          send(response.status, undefined, {
            handled: true,
            mechanism: "manual",
            severity: "error",
          });
        }
        return response;
      } catch (error) {
        send(500, error, {
          handled: false,
          mechanism: "uncaughtException",
          severity: "fatal",
        });
        throw error;
      }
    },
  };
}
