# Real-Environment Verification And Cutover

Parity tests prove known examples. Real-environment verification proves the migration survives production-shaped input and load.

## Verification Ladder

1. **Local parity**: generated fixtures pass, pending count is zero.
2. **Integration parity**: source and target process real protocol boundaries in a controlled environment.
3. **Replay**: sanitized historical requests/events run through both implementations.
4. **Shadow**: production traffic is mirrored to the target without serving target responses.
5. **Canary**: a small percentage of traffic receives target responses.
6. **Cutover**: target becomes primary, old runtime remains rollback-ready.
7. **Cleanup**: compatibility layers are removed after the rollback window.

## Diff Harness

Compare what users and downstream systems observe:

- response body, status, headers, cookies
- binary payloads and protocol messages
- database writes, emitted events, queue messages
- logs, metrics, traces, span names/attributes
- error type/message/code
- latency, throughput, allocation/memory, CPU

Normalize only approved nondeterminism: timestamps, request IDs, random IDs, ordering explicitly declared irrelevant, or environment-specific hostnames. Record every normalization rule.

## Benchmarks

Benchmark at three levels:

- isolated compatibility helpers;
- application-level representative flows;
- server/API throughput with realistic concurrency.

Compare target-native alternatives when possible. If compatibility helpers are slower but necessary, document the cost and the post-cutover removal path.

## Canary Plan

Define before serving traffic:

- traffic selection rule;
- success metrics;
- diff threshold;
- latency/resource threshold;
- error budget impact;
- rollback command/procedure;
- owner and monitoring window.

Ramp gradually, for example:

```text
shadow -> 1% -> 10% -> 50% -> 100%
```

Do not advance while correctness diffs are unexplained or rollback has not been tested.

## Cutover Checklist

- All parity and drift gates pass.
- Shadow/replay diff is below the agreed threshold for the agreed duration.
- Benchmarks are within threshold.
- Observability dashboards and alerts cover target runtime behavior.
- Rollback has been exercised.
- Old runtime/deployment remains available for the rollback window.
- Compatibility deletion backlog is created and prioritized.

## After Cutover

Remove temporary migration scaffolding in small steps:

1. Replace callers of compatibility helpers with target-native APIs where allowed.
2. Delete source-runtime oracle runners that are no longer needed.
3. Keep standards-based conformance tests.
4. Delete generated parity stubs tied only to the retired source runtime.
5. Simplify domain code toward target-language idioms after behavior risk is gone.
