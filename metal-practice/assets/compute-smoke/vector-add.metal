#include <metal_stdlib>
using namespace metal;

// ABI: Float/float arrays at slots 0–2; UInt32/uint count at slot 3.
kernel void vector_add(device const float* lhs [[buffer(0)]],
                       device const float* rhs [[buffer(1)]],
                       device float* output [[buffer(2)]],
                       constant uint& count [[buffer(3)]],
                       uint index [[thread_position_in_grid]]) {
    if (index < count) {
        output[index] = lhs[index] + rhs[index];
    }
}
