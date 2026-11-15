# Debugging and Performance

## Establish Correctness First

Enable API Validation and Shader Validation through the Xcode scheme's Diagnostics tab, or for the process being tested:

```sh
MTL_DEBUG_LAYER=1 MTL_SHADER_VALIDATION=1 ./your-metal-program
```

[API Validation](https://developer.apple.com/documentation/xcode/validating-your-apps-metal-api-usage) checks host-side misuse such as invalid resource setup and encoding. [Shader Validation](https://developer.apple.com/documentation/xcode/validating-your-apps-metal-shader-usage) adds GPU checks for issues including out-of-bounds accesses and nonresident resources. API Validation's unretained-resource checks do not cover `MTL4CommandBuffer`; continue to review explicit lifetime management.

Fix validation failures before interpreting pixels or timing. Include the GPU error and labeled pass/resource in diagnostics. A completed CPU encoding step does not prove the GPU succeeded. Keep validation enabled for correctness runs and disable its instrumentation for representative performance measurements.

For a nondeterministic failure, capture the smallest failing workload with fixed inputs and one frame/dispatch. Inspect bound resources, pipeline state, attachment contents and producer/consumer stages in Xcode's Metal debugger. Use [Metal developer workflows](https://developer.apple.com/documentation/xcode/metal-developer-workflows) and [Inspecting shaders](https://developer.apple.com/documentation/xcode/inspecting-shaders) to choose the appropriate capture/inspection tool.

## Measure the Limiting Timeline

Record device, OS, build configuration, resolution/data size, feature settings, frame pacing, and warm-up policy. Separate CPU encoding/submission time, GPU work, compilation/loading stalls and end-to-end latency. For a requested FPS, calculate its frame budget with `1000 / FPS`; 60 FPS allows about 16.67 ms. CPU and GPU work can overlap, so reason from their timelines rather than simply adding their durations.

Use Metal Performance HUD to locate hitches and choose a capture interval. Enable it for a rendering app with `MTL_HUD_ENABLED=1`; add `MTL_HUD_LOG_ENABLED=1` when per-frame logs are useful. See [Monitoring graphics performance](https://developer.apple.com/documentation/xcode/monitoring-your-metal-apps-graphics-performance). Use Instruments and GPU counters/captures to test a specific hypothesis, not FPS alone.

| Observation | Next experiment |
| --- | --- |
| CPU submission dominates | Reuse pipelines/resources; reduce redundant bindings and encoding; investigate argument buffers/tables if binding overhead is measured |
| GPU bandwidth dominates | Inspect texture formats, pass load/store traffic, temporary targets and unnecessary copies |
| Compute occupancy or execution dominates | Measure legal group shapes, register/shared-memory pressure, work distribution and memory access patterns |
| Occasional long frames | Correlate shader compilation, asset streaming, allocation, or a wait with the hitch |
| CPU/GPU idle gaps | Inspect resource dependencies, frame-resource availability and synchronization scope |

These are hypotheses to measure, not automatic fixes. Change one relevant variable, rerun correctness checks, and compare the same workload. Apple's [performance investigation guide](https://developer.apple.com/documentation/metal/improving-your-games-graphics-performance-and-settings) explains separating CPU/GPU causes and tuning settings from evidence.

## Interpret the Test Environment

Simulator is useful for workflow checks, but it uses the host Mac GPU through a translation layer and does not reproduce the selected device's GPU. Capabilities and limits can differ. Validate the final rendering path and performance on target hardware. See [Developing Metal apps that run in Simulator](https://developer.apple.com/documentation/metal/developing-metal-apps-that-run-in-simulator).

When GPU execution is unavailable in CI, distinguish a shader compilation check from an executed GPU correctness test. Keep the CPU oracle tests runnable separately; report the missing hardware run explicitly.
