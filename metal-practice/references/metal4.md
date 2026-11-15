# Metal 4 API Boundary

## Choose a Complete Submission Path

Metal 4 introduces a distinct submission family; it is not a mechanical rename of the original API. Use the [core API overview](https://developer.apple.com/documentation/metal/understanding-the-metal-4-core-api) to orient yourself, then check the exact Swift/Objective-C/C++ declarations in the selected SDK.

`MTL4CommandQueue` and `MTLGPUFamily.metal4` were introduced with the OS 26 generation. Gate the code with platform availability and `device.supportsFamily(.metal4)`, then check any additional required feature. The [`metal4` capability](https://developer.apple.com/documentation/metal/mtlgpufamily/metal4) and [feature detection guide](https://developer.apple.com/documentation/metal/detecting-gpu-features-and-metal-software-versions) are the authorities. Do not infer Metal 4 support from unified memory alone.

| Concern | Original API | Metal 4 |
| --- | --- | --- |
| Create a command buffer | From an `MTLCommandQueue` | From the `MTLDevice`; begin with an allocator |
| Submit | `commandBuffer.commit()` | Queue commits an array of `MTL4CommandBuffer` instances |
| Reuse command storage | New command buffer per submission | Reusable command buffers; allocator memory has its own lifetime |
| Bind shader resources | Encoder setters / argument buffers | `MTL4ArgumentTable` assigned to encoder stages |
| Resource hazards | Automatic tracking for eligible resources | Explicit synchronization of access conflicts |

Do not copy `setBuffer`, `present`, completion-handler, or `commit` calls from `MTLCommandBuffer`/original encoders onto Metal 4 types. Shared resource types can remain shared while submission code stays separate.

## Track Allocator and Resource Lifetimes

Follow [`MTL4CommandBuffer`](https://developer.apple.com/documentation/metal/mtl4commandbuffer) and the queue's [`commit(_:options:)`](https://developer.apple.com/documentation/metal/mtl4commandqueue/commit(_:options:)) contract: begin encoding with an allocator, finish encoders, end the command buffer, then submit it to a queue from the same device.

A committed command buffer can be re-encoded using appropriate allocator memory, but an allocator's memory cannot be recycled while any GPU submission still uses it. [`MTL4CommandAllocator.reset()`](https://developer.apple.com/documentation/metal/mtl4commandallocator/reset()) requires completion of all command buffers backed by that allocator. Maintain allocator ownership per in-flight slot or another explicitly tracked completion boundary.

Metal 4 command buffers do not strongly retain their resource dependencies. Keep those resources alive through GPU completion. Do not assume an argument-table entry is ownership, residency, or a barrier. Use [MTL4ArgumentTable](https://developer.apple.com/documentation/metal/mtl4argumenttable) for binding declarations and [memory and synchronization](memory-and-synchronization.md) for the separate residency/dependency responsibilities.

## Render and Present with the Metal 4 Protocol

Use Apple's [Drawing a triangle with Metal 4](https://developer.apple.com/documentation/metal/drawing-a-triangle-with-metal-4) as the end-to-end reference. Its lifecycle includes:

- Residency sets covering application resources and the view/layer's drawable allocations.
- An available allocator and mutable resources for the selected frame slot.
- A Metal 4 render-pass descriptor and argument-table bindings.
- Queue `waitForDrawable`, command-buffer submission, queue `signalDrawable`, and drawable `present` in that order.
- A completion signal, such as a shared event, that permits frame resources and allocator memory to be reused.

Recheck the SDK's view/layer residency APIs when adapting the sample to another host framework. Do not assume a manually created drawable or texture is covered by an unrelated residency set.

## Compile Without Introducing Frame Hitches

Metal 4 uses `MTL4Compiler` for explicit compilation scheduling. Synchronous setup is reasonable for small prototypes; for expensive runtime variants, move compilation to an appropriate queue and manage when compiled pipelines become available. Consider specialization and harvesting/binary archives when measurements justify them. See [Using the Metal 4 compilation API](https://developer.apple.com/documentation/metal/using-the-metal-4-compilation-api).

Incremental adoption is supported. When old and new queues exchange a resource, coordinate them with an event and retain each path's own completion/error handling. A partial migration must preserve the original path's externally observable result.
