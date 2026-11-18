import assert from "node:assert/strict";
import test from "node:test";

import { withTelemetry } from "../scripts/telemetry-runtime.ts";

test("the 200ms default logs a 225ms D1 query without an OTLP endpoint", async (t) => {
  let elapsed = 0;
  t.mock.method(performance, "now", () => {
    const current = elapsed;
    elapsed += 225;
    return current;
  });
  const warnings = t.mock.method(console, "warn", () => {});
  const network = t.mock.method(globalThis, "fetch", () => {
    throw new Error("Unconfigured telemetry must not send requests");
  });
  const env = {
    DB: {
      prepare(_sql: string) {
        return { async first() { return { greeting: "hello" }; } };
      },
    },
  };
  const handler = withTelemetry({
    async fetch(_request, bindings) {
      const row = await bindings.DB.prepare("SELECT greeting FROM messages").first();
      return new Response(row.greeting);
    },
  });
  const response = await handler.fetch(new Request("https://example.test/messages"), env, {
    waitUntil() { throw new Error("Unconfigured telemetry must not schedule exports"); },
  });

  assert.equal(await response.text(), "hello");
  assert.equal(network.mock.calls.length, 0);
  assert.equal(warnings.mock.calls.length, 1);
  const warning = JSON.parse(warnings.mock.calls[0].arguments[0]);
  assert.equal(warning.event, "d1.slow_query");
  assert.equal(warning.binding, "DB");
  assert.equal(warning.op, "first");
  assert.equal(warning.duration_ms, 225);
  assert.equal(warning.ok, true);
});
