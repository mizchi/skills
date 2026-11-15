import Foundation
import Metal

struct SmokeFailure: Error, CustomStringConvertible {
    let description: String
}

func require(_ condition: Bool, _ message: String) throws {
    if !condition { throw SmokeFailure(description: message) }
}

// This example deliberately uses MTLCommandQueue, not the Metal 4 submission API.
final class VectorAdder {
    let device: MTLDevice
    let threadsPerGroup: Int
    private let queue: MTLCommandQueue
    private let pipeline: MTLComputePipelineState

    init(shaderURL: URL) throws {
        guard let device = MTLCreateSystemDefaultDevice(),
              let queue = device.makeCommandQueue() else {
            throw SmokeFailure(description: "A macOS Metal device is required; GPU tests did not run")
        }
        let source = try String(contentsOf: shaderURL, encoding: .utf8)
        let library = try device.makeLibrary(source: source, options: nil)
        guard let function = library.makeFunction(name: "vector_add") else {
            throw SmokeFailure(description: "Missing vector_add kernel")
        }
        let pipeline = try device.makeComputePipelineState(function: function)
        self.device = device
        self.queue = queue
        self.pipeline = pipeline
        // A starting size, not a claim about the fastest configuration.
        let width = pipeline.threadExecutionWidth
        self.threadsPerGroup = width * min(4, pipeline.maxTotalThreadsPerThreadgroup / width)
    }

    func add(_ lhs: [Float], _ rhs: [Float]) throws -> [Float] {
        try require(lhs.count == rhs.count, "Input lengths differ")
        guard !lhs.isEmpty else { return [] } // No zero-sized allocation or dispatch.
        try require(lhs.count <= Int(UInt32.max), "Element count exceeds the shader ABI")
        var count = UInt32(lhs.count)
        let sentinel: Float = 123456
        let paddedCount = lhs.count + threadsPerGroup
        let byteCount = paddedCount * MemoryLayout<Float>.stride

        func makeBuffer(_ values: [Float]) throws -> MTLBuffer {
            try values.withUnsafeBytes { bytes in
                guard let buffer = device.makeBuffer(
                    bytes: bytes.baseAddress!, length: byteCount, options: .storageModeShared
                ) else {
                    throw SmokeFailure(description: "Buffer allocation failed")
                }
                return buffer
            }
        }

        let a = try makeBuffer(lhs + Array(repeating: 17, count: threadsPerGroup))
        let b = try makeBuffer(rhs + Array(repeating: 23, count: threadsPerGroup))
        let output = try makeBuffer(Array(repeating: sentinel, count: paddedCount))
        a.label = "Vector input A"
        b.label = "Vector input B"
        output.label = "Vector output and guard region"

        guard let commands = queue.makeCommandBuffer(),
              let encoder = commands.makeComputeCommandEncoder() else {
            throw SmokeFailure(description: "Command encoding setup failed")
        }
        commands.label = "Vector addition smoke test"
        encoder.setComputePipelineState(pipeline)
        encoder.setBuffer(a, offset: 0, index: 0)
        encoder.setBuffer(b, offset: 0, index: 1)
        encoder.setBuffer(output, offset: 0, index: 2)
        encoder.setBytes(&count, length: MemoryLayout<UInt32>.size, index: 3)
        // Uniform groups exercise the kernel's bounds check on every supported GPU.
        encoder.dispatchThreadgroups(
            MTLSize(width: (lhs.count + threadsPerGroup - 1) / threadsPerGroup, height: 1, depth: 1),
            threadsPerThreadgroup: MTLSize(width: threadsPerGroup, height: 1, depth: 1)
        )
        encoder.endEncoding()
        commands.commit()
        // Blocking readback belongs in this test, not in a frame-rendering loop.
        commands.waitUntilCompleted()
        guard commands.status == .completed else {
            throw SmokeFailure(description: "GPU failure: \(String(describing: commands.error))")
        }

        let values = output.contents().assumingMemoryBound(to: Float.self)
        for index in lhs.count..<paddedCount {
            try require(values[index] == sentinel, "Kernel wrote past count at index \(index)")
        }
        return Array(UnsafeBufferPointer(start: values, count: lhs.count))
    }
}

func runSmokeTest(shaderURL: URL) throws {
    let adder = try VectorAdder(shaderURL: shaderURL)
    let group = adder.threadsPerGroup
    let counts = Array(Set([0, 1, max(1, group - 1), group, group + 1, 1025])).sorted()
    for count in counts {
        let lhs = (0..<count).map { Float($0 % 29) - 14 }
        let rhs = (0..<count).map { Float($0 % 13) * 0.25 - 1.5 }
        let actual = try adder.add(lhs, rhs)
        try require(actual.count == count, "Incorrect output length for count=\(count)")
        for index in 0..<count {
            let expected = lhs[index] + rhs[index]
            try require(
                actual[index].isFinite && abs(actual[index] - expected) <= 1e-6,
                "count=\(count), index=\(index): expected \(expected), got \(actual[index])"
            )
        }
    }
    do {
        _ = try adder.add([1], [])
    } catch let failure as SmokeFailure where failure.description == "Input lengths differ" {
        print("PASS: \(adder.device.name); counts=\(counts); guards and length contract verified")
        return
    }
    throw SmokeFailure(description: "Mismatched input lengths were accepted")
}

do {
    guard CommandLine.arguments.count == 2 else {
        throw SmokeFailure(description: "Usage: compute-smoke path/to/vector-add.metal")
    }
    try runSmokeTest(shaderURL: URL(fileURLWithPath: CommandLine.arguments[1]))
} catch {
    FileHandle.standardError.write(Data("FAIL: \(error)\n".utf8))
    exit(1)
}
