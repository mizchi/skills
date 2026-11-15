import {
  context, propagation, SpanKind, SpanStatusCode, trace,
  type Tracer,
} from '@opentelemetry/api';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { BatchSpanProcessor, type SpanExporter } from '@opentelemetry/sdk-trace';

export function createTelemetry(
  exporter: SpanExporter = new OTLPTraceExporter(),
  serviceName = 'my-service',
) {
  const sdk = new NodeSDK({
    resource: resourceFromAttributes({ 'service.name': serviceName }),
    spanProcessors: [new BatchSpanProcessor({ exporter })],
  });
  sdk.start();
  return { sdk, tracer: trace.getTracer(serviceName) };
}

export async function incomingSpan<T>(
  tracer: Tracer,
  headers: Headers,
  routeName: string,
  operation: () => Promise<T>,
): Promise<T> {
  const parent = propagation.extract(context.active(), Object.fromEntries(headers));
  return tracer.startActiveSpan(routeName, { kind: SpanKind.SERVER }, parent, async (span) => {
    try {
      return await operation();
    } catch (error) {
      const exception = error instanceof Error ? error : new Error(String(error));
      span.recordException(exception);
      span.setStatus({ code: SpanStatusCode.ERROR, message: exception.message });
      throw error;
    } finally {
      span.end();
    }
  });
}
