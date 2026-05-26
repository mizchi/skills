---
name: esbuild-otel-instrumentation
description: Use when esbuild ESM bundle (`--format=esm`) を出力したアプリで `@opentelemetry/instrumentation-*` の auto-instrumentation が無音失敗し、 trace / span が一切送信されない症状が出るとき。 OTel が configure はされているのに Tempo / Jaeger / collector に何も届かない、 SDK init log は出るのに span が出ない、 等の報告から起動 (user が esbuild bundling と症状を結び付けていなくても OK)。
---

# esbuild ESM bundle で OTel auto-instrumentation が動かない

## 症状

Hono / Node TypeScript アプリで:

- `@opentelemetry/sdk-node` または `@opentelemetry/sdk-trace-node` を register
- `@opentelemetry/instrumentation-http` / `instrumentation-grpc` 等を `registerInstrumentations()` で追加
- アプリ起動 / リクエスト処理は正常
- **collector に span が一切届かない** (no error, no log)

## 原因

`@opentelemetry/instrumentation-*` 系は内部で **`require-in-the-middle`** を使って **CommonJS の `require()`** を hook して target module (`node:http` 等) に monkey-patch を仕込む。

esbuild で `--format=esm` bundle すると、bundle 内の `import { createServer } from "node:http"` は **ESM static import** に変換され、`require()` は呼ばれない → hook が発火しない → patch されない → span が作られない。

エラーは出ない (silent failure)。

## 回避策（学習プロジェクトでの実用順）

### A. Manual span に倒す（最短）

middleware で明示的に span を作る:

```typescript
import { context, propagation, SpanStatusCode, trace } from "@opentelemetry/api";

const tracer = trace.getTracer("hono");

app.use(async (c, next) => {
  await tracer.startActiveSpan(
    `HTTP ${c.req.method} ${path}`,
    {
      attributes: {
        "http.method": c.req.method,
        "http.route": path,
      },
    },
    async (span) => {
      try {
        await next();
        span.setAttribute("http.status_code", c.res.status);
        span.setStatus({ code: SpanStatusCode.OK });
      } catch (e: any) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: e?.message });
        throw e;
      } finally {
        span.end();
      }
    },
  );
});
```

下流 service への gRPC call は metadata に `traceparent` を inject:

```typescript
const callUnary = (method, req) => {
  const metadata = new grpc.Metadata();
  propagation.inject(context.active(), metadata, {
    set: (carrier, key, value) => (carrier as grpc.Metadata).set(key, value),
  });
  return new Promise((resolve, reject) => {
    client[method](req, metadata, (err, res) => err ? reject(err) : resolve(res));
  });
};
```

### B. CJS にして bundle

`--format=cjs` にすれば require hook が動く。ESM 専用 dep が無いプロジェクトで有効。Hono は CJS でも動く。

### C. bundle せず実行

`tsx` / `node --experimental-vm-modules` で bundle 経由せずに実行 + `node --import @opentelemetry/auto-instrumentations-node/register`。

container image size が増えて image build が複雑化、production deploy では非推奨。

## 確認

manual span に切り替えた後、collector に debug exporter を一時追加して trace data 受信確認:

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

collector log で `Trace ID: ... Name: HTTP GET /api/notes` が見えれば pipeline OK。

## 関連

- esbuild + Vite + SWC など他の bundler でも `require-in-the-middle` ベースの auto-instrumentation は同種問題が出る
- OpenTelemetry の `instrumentation-*` package は static import 経由の patch を提供しない (2026-05 時点)
- Bun は同種問題を抱えてないが代わりに別の互換性 issue がある
