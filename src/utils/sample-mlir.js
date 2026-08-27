/**
 * Sample MLIR for the built-in demo.
 */
export const SAMPLE_MLIR = `module attributes {stream.affinity.default = #hal.device.affinity<@__device_0>} {
  util.global private @__device_0 = #hal.device.target<"local", [#hal.executable.target<"llvm-cpu", "embedded-elf-arm_64">]> : !hal.device
  util.func public @matmul(%arg0: !hal.buffer_view, %arg1: !hal.buffer_view) -> !hal.buffer_view attributes {iree.abi.stub} {
    %cst = arith.constant 0.000000e+00 : f32
    %0 = hal.tensor.import %arg0 "input0" : !hal.buffer_view -> tensor<4x8xf32>
    %1 = hal.tensor.import %arg1 "input1" : !hal.buffer_view -> tensor<8x4xf32>
    %2 = tensor.empty() : tensor<4x4xf32>
    %3 = linalg.fill ins(%cst : f32) outs(%2 : tensor<4x4xf32>) -> tensor<4x4xf32>
    %4 = linalg.matmul ins(%0, %1 : tensor<4x8xf32>, tensor<8x4xf32>) outs(%3 : tensor<4x4xf32>) -> tensor<4x4xf32>
    %5 = hal.tensor.export %4 "output0" : tensor<4x4xf32> -> !hal.buffer_view
    util.return %5 : !hal.buffer_view
  }
}`;
