# Rendering and Presentation

## Set Up One Predictable Pass

For an original-API renderer, create the device, command queue, shader library, and render pipeline outside the draw loop. An `MTKView` supplies the current render-pass descriptor and drawable. Configure the pipeline for the actual color/depth/stencil formats and sample count of its attachments. Handle drawable-size changes using pixel dimensions, including size-dependent textures and projection data. See [Using Metal to draw a view's contents](https://developer.apple.com/documentation/metal/using-metal-to-draw-a-view's-contents) and [MTKView](https://developer.apple.com/documentation/metalkit/mtkview).

The original-API frame sequence is:

1. Obtain an available frame-resource slot and update only resources owned by that slot.
2. Obtain the current render-pass descriptor and drawable close to when rendering needs them. If unavailable, skip cleanly and release any reserved slot.
3. Create a command buffer and render encoder, bind the pipeline/resources, and encode draws.
4. End encoding, register completion/error handling, schedule `commandBuffer.present(drawable)`, and commit.
5. Release the slot when the submitted work completes. Every reserved slot needs exactly one release, including paths that abandon a frame before submission.

This sequence uses `MTLCommandBuffer`. Metal 4 has a different presentation protocol; use [Metal 4](metal4.md) rather than mechanically substituting names.

## Choose Attachment Actions from Their Consumers

| Requirement | Load action | Store action |
| --- | --- | --- |
| Previous values unnecessary; every relevant pixel overwritten | `.dontCare` | Preserve only if a later consumer needs the output |
| Previous values unnecessary; only part of the target drawn | `.clear` | Preserve if presented or consumed later |
| Existing values must contribute to this pass | `.load` | Preserve if consumed later |
| Transient depth/stencil with no later consumer | Usually `.clear` | `.dontCare` |
| MSAA output needed only as a resolved image | As required by the pass | `.multisampleResolve` with a resolve texture |

Use `.store` for an ordinary drawable color attachment; with MSAA, preserve the resolved drawable through the appropriate resolve action. `.dontCare` means undefined contents, not zero. A memoryless attachment cannot load persistent previous contents or store its multisample contents to system memory. See [Setting load and store actions](https://developer.apple.com/documentation/metal/setting-load-and-store-actions).

When splitting work into passes, explicitly account for the previous pass's store and the next pass's read/load. When merging passes, verify that intermediate data can remain local and that all attachment formats and dependencies remain valid.

## Diagnose a Blank or Incorrect Frame

Check these in order, narrowing to one draw and a constant-color fragment shader:

- Drawable/pass availability and whether presentation was scheduled.
- Pipeline/attachment format and sample-count agreement.
- Vertex count, binding slots, byte offsets/stride, transforms and clip-space positions.
- Viewport/scissor, face winding/culling, depth/stencil tests, and blend state.
- Texture data, sampling coordinates, color space, and alpha convention.
- Whether a preceding producer finished and preserved the input being sampled.

Use offscreen pixel checks for deterministic rendering tests and Xcode GPU captures for pipeline inspection. Keep image tolerance appropriate to the formats and target hardware; a screenshot alone is insufficient evidence for synchronization correctness.
