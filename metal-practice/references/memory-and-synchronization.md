# Memory and Synchronization

## Choose Storage for the Actual Access Pattern

| Mode | Typical use | Required care |
| --- | --- | --- |
| `.shared` | CPU-populated inputs, CPU-readable results | Order CPU/GPU access even on unified memory |
| `.private` | GPU-owned intermediates and render targets | Upload/read back through supported copies; CPU cannot use `contents()` directly |
| `.memoryless` | Supported transient render attachments | Contents cannot persist for a later pass or CPU readback |
| `.managed` | Existing Intel/discrete-GPU macOS paths that require it | Explicitly synchronize CPU and GPU copies; check SDK availability/deprecation |

For Apple GPUs, see [Choosing a resource storage mode for Apple GPUs](https://developer.apple.com/documentation/metal/choosing-a-resource-storage-mode-for-apple-gpus). Memoryless storage applies to textures, not buffers. Do not apply managed-resource synchronization recipes to ordinary shared Apple-silicon buffers.

For managed buffers, notify CPU modifications with `didModifyRange`. After GPU writes, encode a blit `synchronize(resource:)` and wait for its successful completion before CPU reads. Completion alone does not replace the managed copy operation. See [Synchronizing a managed resource in macOS](https://developer.apple.com/documentation/metal/synchronizing-a-managed-resource-in-macos). Prefer the resource-specific recipe for managed textures.

## Separate Three Responsibilities

| Responsibility | Question | Mechanism |
| --- | --- | --- |
| Object lifetime | Does the resource object/allocation still exist? | Strong ownership through its last use |
| Residency | Can the GPU access its backing allocation? | Applicable direct bindings, `useResource`/`useHeap`, or residency sets |
| Synchronization | Is the producer finished before the consumer touches the bytes? | Correct ordering, barriers, fences, events and CPU completion notifications |

For indirect resources in original-API argument buffers, binding the argument buffer alone does not declare all referenced allocations. Follow [Managing groups of resources with argument buffers](https://developer.apple.com/documentation/metal/managing-groups-of-resources-with-argument-buffers), including applicable `useResource`/heap declarations. For residency sets, see [Simplifying GPU resource management](https://developer.apple.com/documentation/metal/simplifying-gpu-resource-management-with-residency-sets); residency does not establish hazard ordering.

## Make Producer/Consumer Edges Explicit

Inventory accesses to each allocation, including aliases, indirect references and render attachments. A read after a write and overlapping writes need ordering. Read-only sharing does not create the same conflict.

For work on `MTLCommandQueue`, eligible tracked resources can be synchronized automatically. This is not a guarantee for every resource: direct device allocations default to tracked, heap allocations default to untracked, and indirect access needs appropriate declarations. For `MTL4CommandQueue`, `hazardTrackingMode` has no effect; explicitly resolve conflicts. See [Resource synchronization](https://developer.apple.com/documentation/metal/resource-synchronization).

Choose the smallest synchronization scope that covers the dependency:

| Dependency | Mechanism to investigate |
| --- | --- |
| Stages within one pass | [Intrapass barriers](https://developer.apple.com/documentation/metal/synchronizing-stages-within-a-pass) |
| Producing and consuming passes on one queue | [Fences](https://developer.apple.com/documentation/metal/synchronizing-passes-with-a-fence); Metal 4 also offers [consumer barriers](https://developer.apple.com/documentation/metal/synchronizing-passes-with-consumer-barriers) |
| Work across command queues | `MTLEvent` signal/wait |
| CPU/GPU or cross-device coordination | `MTLSharedEvent` or appropriate CPU completion notification |

Choose the stages/accesses from the actual producer and consumer, including attachment load/store operations. Ending an encoder or enqueueing work earlier is not a substitute for analyzing an untracked resource dependency.

## Bound Work in Flight

Use a pool of per-frame mutable resources so the CPU can prepare one frame while the GPU consumes another. Three slots are a common starting point, not a mandatory count. Reuse a slot only after its GPU work completes, and bound submissions to the pool capacity. See [Synchronizing CPU and GPU work](https://developer.apple.com/documentation/metal/synchronizing-cpu-and-gpu-work).

Pair every acquired slot with a completion release or an early-abandon release. Handle GPU errors as well as successful frames. A modulo frame index alone does not establish that the previous use of the slot has finished.
