---
name: metal-practice
description: Build and review Apple Metal rendering and GPU compute code, including MetalKit views, Metal Shading Language kernels, CPU–GPU data layout, resource synchronization, and performance diagnosis. Use for .metal files, MTL/MTL4 APIs, MTKView, GPU memory hazards, or Metal shader failures on Apple platforms.
---

# Metal Practice

Use Apple's Metal documentation to implement a small, verifiable GPU workload, then expand it while preserving data contracts and resource ownership. Keep the project's existing host language and API generation unless the task calls for a change.

Source entry point: [Metal documentation (Japanese)](https://developer.apple.com/jp/documentation/metal). The references below synthesize the corresponding English API articles; they are practical guidance, not a copy of the manual. Last checked: 2026-11-15. Recheck symbol availability and device limits against the project's SDK when implementing.

## Choose the Relevant Reference

| Task | Read |
| --- | --- |
| MTKView, render passes, attachments, presentation | [Rendering](references/rendering.md) |
| Compute dispatch, kernel bounds, host/shader ABI | [Compute and ABI](references/compute-and-abi.md) |
| Storage modes, frames in flight, races, fences and events | [Memory and synchronization](references/memory-and-synchronization.md) |
| MTL4 submission, allocators, argument tables, residency | [Metal 4](references/metal4.md) |
| Validation errors, GPU captures, stalls, profiling | [Debugging and performance](references/debugging-and-performance.md) |

Read only the references needed for the current task. For ray tracing, mesh shading, MetalFX, sparse resources, or machine learning, start with Apple's [sample library](https://developer.apple.com/documentation/metal/metal-sample-code-library) and the feature's own documentation rather than extrapolating from the basic examples here.

## Establish the Execution Contract

Before choosing a pipeline, identify:

- Target OS/deployment version, Xcode SDK, real GPU, and whether execution is in Simulator.
- Rendering versus compute, expected dimensions, output format, numerical tolerance, and any performance target.
- Existing submission family: `MTLCommandQueue` or `MTL4CommandQueue`.
- Who writes each resource, who reads it next, and the completion condition permitting reuse.

Use both OS availability and `MTLDevice` feature checks. An OS check alone does not establish hardware support. Use `supportsFamily(_:)` and feature-specific properties; consult the [feature detection guide](https://developer.apple.com/documentation/metal/detecting-gpu-features-and-metal-software-versions) for the required capability. Do not infer support from a device's marketing name.

For a new Metal 4 path, read the Metal 4 reference before writing submission code. Preserve an existing original-API path when it meets the task; do not migrate it as a side effect of fixing a shader.

## Implement with a Testable Boundary

1. **Explore:** trace one workload from CPU inputs through resource bindings and commands to output. Write down buffer indices, scalar widths, structure offsets/stride, texture formats, and ownership transitions.
2. **Red:** reproduce the wrong result with a CPU oracle or a small offscreen render. Include empty input, one element, and a size that does not divide evenly into a threadgroup. For visual bugs, fix camera, time, resolution, and color space.
3. **Green:** use one device, one queue, and the smallest useful pass. Check allocation/compilation failures and GPU completion errors before inspecting output.
4. **Refactor:** separate pure transforms and scene state from GPU resource ownership and command encoding. Reuse expensive pipeline state and long-lived resources. Add passes or overlap only after their dependency edges are explicit.

Keep host/shader declarations as a contract layer: fixed-width scalar types, documented binding slots, layout checks, and matching texture access modes. A successful shader compile does not prove that Swift/C++ and MSL agree on the bytes.

## Resource and Submission Rules

- Distinguish **object lifetime**, **GPU residency**, and **execution synchronization**. Satisfying one does not establish the others.
- Do not overwrite a per-frame buffer, recycle a heap allocation, or reset a command allocator while the GPU can still use its contents.
- Unified memory still needs CPU/GPU ownership ordering. CPU readback must follow successful GPU completion and any storage-mode-specific synchronization.
- Under Metal 4, explicitly resolve access conflicts; `hazardTrackingMode = .tracked` does not restore automatic tracking. See the [synchronization reference](references/memory-and-synchronization.md).
- Keep blocking completion waits in tests, controlled readback, or other deliberately synchronous operations. Use completion notifications and bounded frames in flight for continuous rendering.
- Label resources and commands so validation messages and captures identify the failing workload.

## Runnable Compute Check

[assets/compute-smoke](assets/compute-smoke/) contains an original Swift/MSL example using `MTLCommandQueue`. It needs macOS, Xcode with the Metal toolchain, a Metal-capable GPU, and `just`:

```sh
just --justfile <skill-dir>/assets/compute-smoke/justfile check
MTL_DEBUG_LAYER=1 MTL_SHADER_VALIDATION=1 just --justfile <skill-dir>/assets/compute-smoke/justfile test
```

The check compiles and links the shader, then compares GPU vector addition with a CPU oracle. It covers zero and irregular lengths, rejects unequal inputs, and checks a sentinel region for writes beyond the logical count. Missing GPU execution is a failure, not a passing test. The runtime source compilation and blocking readback are conveniences for this diagnostic fixture; move compilation and asynchronous scheduling into the app's appropriate lifecycle when adapting it.

## Completion Evidence

Report the API generation, device/OS tested, correctness checks, and any validation errors. For a performance change, include comparable before/after measurements and the workload/settings used. If only compilation or Simulator behavior was checked, say which real-device behavior remains unverified.
