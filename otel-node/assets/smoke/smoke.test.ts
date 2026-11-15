import assert from 'node:assert/strict';
import { test } from 'node:test';
import { context, propagation, SpanStatusCode, trace } from '@opentelemetry/api';
import type { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace';
import { createTelemetry, incomingSpan } from './instrumentation.ts';

test('incoming context, async children, errors and shutdown reach the exporter', async () => {
  const spans: ReadableSpan[] = [];
  const exporter: SpanExporter = {
    export(batch, done) { spans.push(...batch); done({ code: 0 }); },
    async shutdown() {},
  };
  const { sdk, tracer } = createTelemetry(exporter, 'skill-smoke');
  try {
    await incomingSpan(tracer, new Headers({
      traceparent: '00-11111111111111111111111111111111-2222222222222222-01',
    }), 'GET /users/:id', async () => {
      await Promise.resolve();
      await tracer.startActiveSpan('read user', async (span) => {
        try {
          await Promise.resolve();
          const carrier: Record<string, string> = {};
          propagation.inject(context.active(), carrier);
          assert.match(carrier.traceparent, /^00-11111111111111111111111111111111-/);
        } finally { span.end(); }
      });
    });
    await assert.rejects(incomingSpan(tracer, new Headers(), 'POST /users', async () => {
      throw new Error('write failed');
    }), /write failed/);
  } finally {
    await sdk.shutdown();
    context.disable(); propagation.disable(); trace.disable();
  }
  assert.equal(spans.length, 3);
  const parent = spans.find((s) => s.name === 'GET /users/:id')!;
  const child = spans.find((s) => s.name === 'read user')!;
  const failed = spans.find((s) => s.name === 'POST /users')!;
  assert.equal(parent.spanContext().traceId, '11111111111111111111111111111111');
  assert.equal(parent.parentSpanContext?.spanId, '2222222222222222');
  assert.equal(child.parentSpanContext?.spanId, parent.spanContext().spanId);
  assert.equal(failed.status.code, SpanStatusCode.ERROR);
  assert.equal(failed.events.filter((e) => e.name === 'exception').length, 1);
  assert.ok(spans.every((s) => s.ended));
});
