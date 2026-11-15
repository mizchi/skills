# Compute Dispatch and Host/Shader ABI

## Build the Smallest Compute Path

With the original API, obtain an `MTLFunction` from a library, create an `MTLComputePipelineState`, allocate input/output buffers, and encode pipeline/resource bindings followed by a dispatch. End the encoder and commit the command buffer. Check successful completion before CPU readback. Apple's [Performing calculations on a GPU](https://developer.apple.com/documentation/metal/performing-calculations-on-a-gpu) explains this path; the bundled [smoke check](../assets/compute-smoke/) gives a small Swift implementation with a CPU oracle.

Treat pipeline creation and shader compilation as setup work. In an Xcode app, prefer its built shader library for ordinary bundled shaders. Runtime source compilation is useful for small diagnostics or genuinely dynamic shader sources, but should not be repeated per dispatch.

## Select the Grid from the Pipeline

| Dispatch | Grid definition | Boundary handling |
| --- | --- | --- |
| `dispatchThreads` | Exact logical thread count | Requires nonuniform threadgroup support; edge groups can be smaller |
| `dispatchThreadgroups` | Number of groups × threads per group | Round group counts up and guard the padded elements in the kernel |

Derive candidate group sizes from the pipeline's `threadExecutionWidth` and `maxTotalThreadsPerThreadgroup`; also respect device dimension and threadgroup-memory limits. The largest legal group is not automatically the fastest. For 2D work, choose width/height deliberately and bound their product. Do not hard-code a universal SIMD width. See [Calculating threadgroup and grid sizes](https://developer.apple.com/documentation/metal/calculating-threadgroup-and-grid-sizes).

For independent 1D elements with group width `w`, uniform dispatch needs `(count + w - 1) / w` groups and a shader check `index < count`. Handle zero elements on the host without dispatch. Apple's [`dispatchThreadgroups`](https://developer.apple.com/documentation/metal/mtlcomputecommandencoder/dispatchthreadgroups(_:threadsperthreadgroup:)) documentation describes the padded-grid contract and recommends `dispatchThreads` on supported Apple GPUs. The fixture uses uniform dispatch intentionally to exercise the bounds check.

For cooperative kernels such as reductions, design padding, shared memory, and barrier participation together. Do not transplant an elementwise early return into a kernel with collective operations without checking its synchronization requirements.

## Define the Byte Contract

Document these together with the kernel signature:

| Contract | Host-side check |
| --- | --- |
| `[[buffer(n)]]`, texture and sampler slots | Match the encoder binding indices, including stages |
| Scalar width and signedness | Use `UInt32`/`Int32` for corresponding 32-bit shader integers; do not assume Swift `Int` matches |
| Structure field offsets, alignment and array stride | Inspect `MemoryLayout` and shared C declarations; verify shader layout separately |
| Buffer extent and element count | Allocate using element stride; check offsets, capacity, integer conversion and zero input |
| Texture type, pixel format and access | Match host descriptors and shader read/write/sample declarations |
| Matrix and vector conventions | Verify component padding, matrix storage and multiplication order with known inputs |

An `MTLBuffer` does not encode your element type: both sides must interpret its bytes consistently. See [Buffers](https://developer.apple.com/documentation/metal/buffers). In particular, check three-component vector padding rather than inferring tightly packed storage from the number of components.

## Numerical Verification

Use a CPU implementation independent of the dispatch code. Include signed and varying values, edge sizes around a group boundary, and guard regions when practical. Define absolute/relative tolerances for floating-point work and an explicit NaN/infinity policy. For reductions or mixed precision, account for changed evaluation order before labeling a difference a GPU bug. Preserve the failing input as a regression case.
