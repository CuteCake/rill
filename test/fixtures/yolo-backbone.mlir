module @module attributes {stream.affinity.default = #hal.device.affinity<@__device_0>} {
  util.global private @__device_0 = #hal.device.target<"vulkan", [#hal.executable.target<"vulkan-spirv", "vulkan-spirv-fb", {iree_codegen.target_info = #iree_gpu.target<arch = "vp_android_baseline_2022", features = "spirv:v1.3,cap:Shader", wgp = <compute =  fp32|int32, storage =  b32, subgroup =  none, subgroup_size_choices = [64], max_workgroup_sizes = [128, 128, 64], max_thread_count_per_workgroup = 128, max_workgroup_memory_bytes = 16384, max_workgroup_counts = [65535, 65535, 65535]>>}>]> : !hal.device
  util.global private @__auto.constant_64_3_7_7_torch.float32 = dense_resource<__auto.constant_64_3_7_7_torch.float32> : tensor<64x3x7x7xf32>
  util.global private @__auto.constant_192_64_3_3_torch.float32 = dense_resource<__auto.constant_192_64_3_3_torch.float32> : tensor<192x64x3x3xf32>
  util.global private @__auto.constant_128_192_1_1_torch.float32 = dense_resource<__auto.constant_128_192_1_1_torch.float32> : tensor<128x192x1x1xf32>
  util.global private @__auto.constant_256_128_3_3_torch.float32 = dense_resource<__auto.constant_256_128_3_3_torch.float32> : tensor<256x128x3x3xf32>
  util.global private @__auto.constant_256_256_1_1_torch.float32 = dense_resource<__auto.constant_256_256_1_1_torch.float32> : tensor<256x256x1x1xf32>
  util.global private @__auto.constant_512_256_3_3_torch.float32 = dense_resource<__auto.constant_512_256_3_3_torch.float32> : tensor<512x256x3x3xf32>
  util.global private @__auto.constant_256_512_1_1_torch.float32 = dense_resource<__auto.constant_256_512_1_1_torch.float32> : tensor<256x512x1x1xf32>
  util.global private @__auto.constant_512_256_3_3_torch.float32$1 = dense_resource<__auto.constant_512_256_3_3_torch.float32$1> : tensor<512x256x3x3xf32>
  util.global private @__auto.constant_256_512_1_1_torch.float32$1 = dense_resource<__auto.constant_256_512_1_1_torch.float32$1> : tensor<256x512x1x1xf32>
  util.global private @__auto.constant_512_256_3_3_torch.float32$2 = dense_resource<__auto.constant_512_256_3_3_torch.float32$2> : tensor<512x256x3x3xf32>
  util.global private @__auto.constant_256_512_1_1_torch.float32$2 = dense_resource<__auto.constant_256_512_1_1_torch.float32$2> : tensor<256x512x1x1xf32>
  util.global private @__auto.constant_512_256_3_3_torch.float32$3 = dense_resource<__auto.constant_512_256_3_3_torch.float32$3> : tensor<512x256x3x3xf32>
  util.global private @__auto.constant_256_512_1_1_torch.float32$3 = dense_resource<__auto.constant_256_512_1_1_torch.float32$3> : tensor<256x512x1x1xf32>
  util.global private @__auto.constant_512_256_3_3_torch.float32$4 = dense_resource<__auto.constant_512_256_3_3_torch.float32$4> : tensor<512x256x3x3xf32>
  util.global private @__auto.constant_512_512_1_1_torch.float32 = dense_resource<__auto.constant_512_512_1_1_torch.float32> : tensor<512x512x1x1xf32>
  util.global private @__auto.constant_1024_512_3_3_torch.float32 = dense_resource<__auto.constant_1024_512_3_3_torch.float32> : tensor<1024x512x3x3xf32>
  util.global private @__auto.constant_512_1024_1_1_torch.float32 = dense_resource<__auto.constant_512_1024_1_1_torch.float32> : tensor<512x1024x1x1xf32>
  util.global private @__auto.constant_1024_512_3_3_torch.float32$1 = dense_resource<__auto.constant_1024_512_3_3_torch.float32$1> : tensor<1024x512x3x3xf32>
  util.global private @__auto.constant_512_1024_1_1_torch.float32$1 = dense_resource<__auto.constant_512_1024_1_1_torch.float32$1> : tensor<512x1024x1x1xf32>
  util.global private @__auto.constant_1024_512_3_3_torch.float32$2 = dense_resource<__auto.constant_1024_512_3_3_torch.float32$2> : tensor<1024x512x3x3xf32>
  util.global private @__auto.constant_1024_1024_3_3_torch.float32 = dense_resource<__auto.constant_1024_1024_3_3_torch.float32> : tensor<1024x1024x3x3xf32>
  util.global private @__auto.constant_1024_1024_3_3_torch.float32$1 = dense_resource<__auto.constant_1024_1024_3_3_torch.float32$1> : tensor<1024x1024x3x3xf32>
  util.global private @__auto.constant_1024_1024_3_3_torch.float32$2 = dense_resource<__auto.constant_1024_1024_3_3_torch.float32$2> : tensor<1024x1024x3x3xf32>
  util.global private @__auto.constant_1024_1024_3_3_torch.float32$3 = dense_resource<__auto.constant_1024_1024_3_3_torch.float32$3> : tensor<1024x1024x3x3xf32>
  util.global private @__auto.constant_4096_50176_torch.float32 = dense_resource<__auto.constant_4096_50176_torch.float32> : tensor<4096x50176xf32>
  util.global private @__auto.constant_4096_torch.float32 = dense_resource<__auto.constant_4096_torch.float32> : tensor<4096xf32>
  util.global private @__auto.constant_1470_4096_torch.float32 = dense_resource<__auto.constant_1470_4096_torch.float32> : tensor<1470x4096xf32>
  util.global private @__auto.constant_1470_torch.float32 = dense_resource<__auto.constant_1470_torch.float32> : tensor<1470xf32>
  util.func public @main$async(%arg0: !hal.buffer_view, %arg1: !hal.fence, %arg2: !hal.fence) -> !hal.buffer_view attributes {inlining_policy = #util.inline.never, iree.abi.model = "coarse-fences", iree.abi.stub} {
    %cst = arith.constant dense<0> : tensor<i64>
    %cst_0 = arith.constant dense_resource<torch_tensor_1024_torch.float32_6> : tensor<1024xf32>
    %cst_1 = arith.constant dense_resource<torch_tensor_1024_torch.float32_5> : tensor<1024xf32>
    %cst_2 = arith.constant dense_resource<torch_tensor_1024_torch.float32_4> : tensor<1024xf32>
    %cst_3 = arith.constant dense_resource<torch_tensor_1024_torch.float32_3> : tensor<1024xf32>
    %cst_4 = arith.constant dense_resource<torch_tensor_1024_torch.float32_2> : tensor<1024xf32>
    %cst_5 = arith.constant dense_resource<torch_tensor_512_torch.float32_7> : tensor<512xf32>
    %cst_6 = arith.constant dense_resource<torch_tensor_1024_torch.float32_1> : tensor<1024xf32>
    %cst_7 = arith.constant dense_resource<torch_tensor_512_torch.float32_6> : tensor<512xf32>
    %cst_8 = arith.constant dense_resource<torch_tensor_1024_torch.float32> : tensor<1024xf32>
    %cst_9 = arith.constant dense_resource<torch_tensor_512_torch.float32_5> : tensor<512xf32>
    %cst_10 = arith.constant dense_resource<torch_tensor_512_torch.float32_4> : tensor<512xf32>
    %cst_11 = arith.constant dense_resource<torch_tensor_256_torch.float32_5> : tensor<256xf32>
    %cst_12 = arith.constant dense_resource<torch_tensor_512_torch.float32_3> : tensor<512xf32>
    %cst_13 = arith.constant dense_resource<torch_tensor_256_torch.float32_4> : tensor<256xf32>
    %cst_14 = arith.constant dense_resource<torch_tensor_512_torch.float32_2> : tensor<512xf32>
    %cst_15 = arith.constant dense_resource<torch_tensor_256_torch.float32_3> : tensor<256xf32>
    %cst_16 = arith.constant dense_resource<torch_tensor_512_torch.float32_1> : tensor<512xf32>
    %cst_17 = arith.constant dense_resource<torch_tensor_256_torch.float32_2> : tensor<256xf32>
    %cst_18 = arith.constant dense_resource<torch_tensor_512_torch.float32> : tensor<512xf32>
    %cst_19 = arith.constant dense_resource<torch_tensor_256_torch.float32_1> : tensor<256xf32>
    %cst_20 = arith.constant dense_resource<torch_tensor_256_torch.float32> : tensor<256xf32>
    %cst_21 = arith.constant dense_resource<torch_tensor_128_torch.float32> : tensor<128xf32>
    %cst_22 = arith.constant dense_resource<torch_tensor_192_torch.float32> : tensor<192xf32>
    %cst_23 = arith.constant dense_resource<torch_tensor_64_torch.float32> : tensor<64xf32>
    %cst_24 = arith.constant 0.000000e+00 : f32
    %cst_25 = arith.constant 0xFF800000 : f32
    %cst_26 = arith.constant 0.099999994 : f32
    %0 = hal.tensor.import wait(%arg1) => %arg0 : !hal.buffer_view -> tensor<1x3x448x448xf32>
    %__auto.constant_64_3_7_7_torch.float32 = util.global.load @__auto.constant_64_3_7_7_torch.float32 : tensor<64x3x7x7xf32>
    %padded = tensor.pad %0 low[0, 0, 3, 3] high[0, 0, 3, 3] {
    ^bb0(%arg3: index, %arg4: index, %arg5: index, %arg6: index):
      tensor.yield %cst_24 : f32
    } : tensor<1x3x448x448xf32> to tensor<1x3x454x454xf32>
    %1 = tensor.empty() : tensor<1x64x224x224xf32>
    %broadcasted = linalg.broadcast ins(%cst_23 : tensor<64xf32>) outs(%1 : tensor<1x64x224x224xf32>) dimensions = [0, 2, 3] 
    %2 = linalg.conv_2d_nchw_fchw {dilations = dense<1> : vector<2xi64>, strides = dense<2> : vector<2xi64>} ins(%padded, %__auto.constant_64_3_7_7_torch.float32 : tensor<1x3x454x454xf32>, tensor<64x3x7x7xf32>) outs(%broadcasted : tensor<1x64x224x224xf32>) -> tensor<1x64x224x224xf32>
    %3 = tensor.empty() : tensor<f32>
    %4 = linalg.generic {indexing_maps = [affine_map<() -> ()>, affine_map<() -> ()>], iterator_types = []} ins(%cst : tensor<i64>) outs(%3 : tensor<f32>) {
    ^bb0(%in: i64, %out: f32):
      %133 = arith.sitofp %in : i64 to f32
      linalg.yield %133 : f32
    } -> tensor<f32>
    %5 = linalg.generic {indexing_maps = [affine_map<(d0, d1, d2, d3) -> ()>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>], iterator_types = ["parallel", "parallel", "parallel", "parallel"]} ins(%4, %2 : tensor<f32>, tensor<1x64x224x224xf32>) outs(%1 : tensor<1x64x224x224xf32>) {
    ^bb0(%in: f32, %in_65: f32, %out: f32):
      %133 = arith.cmpf ogt, %in, %in_65 : f32
      %134 = arith.select %133, %in, %in_65 : f32
      linalg.yield %134 : f32
    } -> tensor<1x64x224x224xf32>
    %6 = linalg.generic {indexing_maps = [affine_map<(d0, d1, d2, d3) -> ()>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>], iterator_types = ["parallel", "parallel", "parallel", "parallel"]} ins(%4, %2 : tensor<f32>, tensor<1x64x224x224xf32>) outs(%1 : tensor<1x64x224x224xf32>) {
    ^bb0(%in: f32, %in_65: f32, %out: f32):
      %133 = arith.cmpf olt, %in, %in_65 : f32
      %134 = arith.select %133, %in, %in_65 : f32
      linalg.yield %134 : f32
    } -> tensor<1x64x224x224xf32>
    %7 = linalg.generic {indexing_maps = [affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>], iterator_types = ["parallel", "parallel", "parallel", "parallel"]} ins(%6 : tensor<1x64x224x224xf32>) outs(%1 : tensor<1x64x224x224xf32>) {
    ^bb0(%in: f32, %out: f32):
      %133 = arith.mulf %in, %cst_26 : f32
      linalg.yield %133 : f32
    } -> tensor<1x64x224x224xf32>
    %8 = linalg.generic {indexing_maps = [affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>], iterator_types = ["parallel", "parallel", "parallel", "parallel"]} ins(%5, %7 : tensor<1x64x224x224xf32>, tensor<1x64x224x224xf32>) outs(%1 : tensor<1x64x224x224xf32>) {
    ^bb0(%in: f32, %in_65: f32, %out: f32):
      %133 = arith.addf %in, %in_65 : f32
      linalg.yield %133 : f32
    } -> tensor<1x64x224x224xf32>
    %9 = tensor.empty() : tensor<1x64x112x112xf32>
    %10 = linalg.fill ins(%cst_25 : f32) outs(%9 : tensor<1x64x112x112xf32>) -> tensor<1x64x112x112xf32>
    %11 = tensor.empty() : tensor<2x2xf32>
    %12 = linalg.pooling_nchw_max {dilations = dense<1> : vector<2xi64>, strides = dense<2> : vector<2xi64>} ins(%8, %11 : tensor<1x64x224x224xf32>, tensor<2x2xf32>) outs(%10 : tensor<1x64x112x112xf32>) -> tensor<1x64x112x112xf32>
    %__auto.constant_192_64_3_3_torch.float32 = util.global.load @__auto.constant_192_64_3_3_torch.float32 : tensor<192x64x3x3xf32>
    %padded_27 = tensor.pad %12 low[0, 0, 1, 1] high[0, 0, 1, 1] {
    ^bb0(%arg3: index, %arg4: index, %arg5: index, %arg6: index):
      tensor.yield %cst_24 : f32
    } : tensor<1x64x112x112xf32> to tensor<1x64x114x114xf32>
    %13 = tensor.empty() : tensor<1x192x112x112xf32>
    %broadcasted_28 = linalg.broadcast ins(%cst_22 : tensor<192xf32>) outs(%13 : tensor<1x192x112x112xf32>) dimensions = [0, 2, 3] 
    %14 = linalg.conv_2d_nchw_fchw {dilations = dense<1> : vector<2xi64>, strides = dense<1> : vector<2xi64>} ins(%padded_27, %__auto.constant_192_64_3_3_torch.float32 : tensor<1x64x114x114xf32>, tensor<192x64x3x3xf32>) outs(%broadcasted_28 : tensor<1x192x112x112xf32>) -> tensor<1x192x112x112xf32>
    %15 = linalg.generic {indexing_maps = [affine_map<(d0, d1, d2, d3) -> ()>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>], iterator_types = ["parallel", "parallel", "parallel", "parallel"]} ins(%4, %14 : tensor<f32>, tensor<1x192x112x112xf32>) outs(%13 : tensor<1x192x112x112xf32>) {
    ^bb0(%in: f32, %in_65: f32, %out: f32):
      %133 = arith.cmpf ogt, %in, %in_65 : f32
      %134 = arith.select %133, %in, %in_65 : f32
      linalg.yield %134 : f32
    } -> tensor<1x192x112x112xf32>
    %16 = linalg.generic {indexing_maps = [affine_map<(d0, d1, d2, d3) -> ()>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>], iterator_types = ["parallel", "parallel", "parallel", "parallel"]} ins(%4, %14 : tensor<f32>, tensor<1x192x112x112xf32>) outs(%13 : tensor<1x192x112x112xf32>) {
    ^bb0(%in: f32, %in_65: f32, %out: f32):
      %133 = arith.cmpf olt, %in, %in_65 : f32
      %134 = arith.select %133, %in, %in_65 : f32
      linalg.yield %134 : f32
    } -> tensor<1x192x112x112xf32>
    %17 = linalg.generic {indexing_maps = [affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>], iterator_types = ["parallel", "parallel", "parallel", "parallel"]} ins(%16 : tensor<1x192x112x112xf32>) outs(%13 : tensor<1x192x112x112xf32>) {
    ^bb0(%in: f32, %out: f32):
      %133 = arith.mulf %in, %cst_26 : f32
      linalg.yield %133 : f32
    } -> tensor<1x192x112x112xf32>
    %18 = linalg.generic {indexing_maps = [affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>], iterator_types = ["parallel", "parallel", "parallel", "parallel"]} ins(%15, %17 : tensor<1x192x112x112xf32>, tensor<1x192x112x112xf32>) outs(%13 : tensor<1x192x112x112xf32>) {
    ^bb0(%in: f32, %in_65: f32, %out: f32):
      %133 = arith.addf %in, %in_65 : f32
      linalg.yield %133 : f32
    } -> tensor<1x192x112x112xf32>
    %19 = tensor.empty() : tensor<1x192x56x56xf32>
    %20 = linalg.fill ins(%cst_25 : f32) outs(%19 : tensor<1x192x56x56xf32>) -> tensor<1x192x56x56xf32>
    %21 = linalg.pooling_nchw_max {dilations = dense<1> : vector<2xi64>, strides = dense<2> : vector<2xi64>} ins(%18, %11 : tensor<1x192x112x112xf32>, tensor<2x2xf32>) outs(%20 : tensor<1x192x56x56xf32>) -> tensor<1x192x56x56xf32>
    %__auto.constant_128_192_1_1_torch.float32 = util.global.load @__auto.constant_128_192_1_1_torch.float32 : tensor<128x192x1x1xf32>
    %22 = tensor.empty() : tensor<1x128x56x56xf32>
    %broadcasted_29 = linalg.broadcast ins(%cst_21 : tensor<128xf32>) outs(%22 : tensor<1x128x56x56xf32>) dimensions = [0, 2, 3] 
    %23 = linalg.conv_2d_nchw_fchw {dilations = dense<1> : vector<2xi64>, strides = dense<1> : vector<2xi64>} ins(%21, %__auto.constant_128_192_1_1_torch.float32 : tensor<1x192x56x56xf32>, tensor<128x192x1x1xf32>) outs(%broadcasted_29 : tensor<1x128x56x56xf32>) -> tensor<1x128x56x56xf32>
    %24 = linalg.generic {indexing_maps = [affine_map<(d0, d1, d2, d3) -> ()>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>], iterator_types = ["parallel", "parallel", "parallel", "parallel"]} ins(%4, %23 : tensor<f32>, tensor<1x128x56x56xf32>) outs(%22 : tensor<1x128x56x56xf32>) {
    ^bb0(%in: f32, %in_65: f32, %out: f32):
      %133 = arith.cmpf ogt, %in, %in_65 : f32
      %134 = arith.select %133, %in, %in_65 : f32
      linalg.yield %134 : f32
    } -> tensor<1x128x56x56xf32>
    %25 = linalg.generic {indexing_maps = [affine_map<(d0, d1, d2, d3) -> ()>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>], iterator_types = ["parallel", "parallel", "parallel", "parallel"]} ins(%4, %23 : tensor<f32>, tensor<1x128x56x56xf32>) outs(%22 : tensor<1x128x56x56xf32>) {
    ^bb0(%in: f32, %in_65: f32, %out: f32):
      %133 = arith.cmpf olt, %in, %in_65 : f32
      %134 = arith.select %133, %in, %in_65 : f32
      linalg.yield %134 : f32
    } -> tensor<1x128x56x56xf32>
    %26 = linalg.generic {indexing_maps = [affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>], iterator_types = ["parallel", "parallel", "parallel", "parallel"]} ins(%25 : tensor<1x128x56x56xf32>) outs(%22 : tensor<1x128x56x56xf32>) {
    ^bb0(%in: f32, %out: f32):
      %133 = arith.mulf %in, %cst_26 : f32
      linalg.yield %133 : f32
    } -> tensor<1x128x56x56xf32>
    %27 = linalg.generic {indexing_maps = [affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>], iterator_types = ["parallel", "parallel", "parallel", "parallel"]} ins(%24, %26 : tensor<1x128x56x56xf32>, tensor<1x128x56x56xf32>) outs(%22 : tensor<1x128x56x56xf32>) {
    ^bb0(%in: f32, %in_65: f32, %out: f32):
      %133 = arith.addf %in, %in_65 : f32
      linalg.yield %133 : f32
    } -> tensor<1x128x56x56xf32>
    %__auto.constant_256_128_3_3_torch.float32 = util.global.load @__auto.constant_256_128_3_3_torch.float32 : tensor<256x128x3x3xf32>
    %padded_30 = tensor.pad %27 low[0, 0, 1, 1] high[0, 0, 1, 1] {
    ^bb0(%arg3: index, %arg4: index, %arg5: index, %arg6: index):
      tensor.yield %cst_24 : f32
    } : tensor<1x128x56x56xf32> to tensor<1x128x58x58xf32>
    %28 = tensor.empty() : tensor<1x256x56x56xf32>
    %broadcasted_31 = linalg.broadcast ins(%cst_20 : tensor<256xf32>) outs(%28 : tensor<1x256x56x56xf32>) dimensions = [0, 2, 3] 
    %29 = linalg.conv_2d_nchw_fchw {dilations = dense<1> : vector<2xi64>, strides = dense<1> : vector<2xi64>} ins(%padded_30, %__auto.constant_256_128_3_3_torch.float32 : tensor<1x128x58x58xf32>, tensor<256x128x3x3xf32>) outs(%broadcasted_31 : tensor<1x256x56x56xf32>) -> tensor<1x256x56x56xf32>
    %30 = linalg.generic {indexing_maps = [affine_map<(d0, d1, d2, d3) -> ()>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>], iterator_types = ["parallel", "parallel", "parallel", "parallel"]} ins(%4, %29 : tensor<f32>, tensor<1x256x56x56xf32>) outs(%28 : tensor<1x256x56x56xf32>) {
    ^bb0(%in: f32, %in_65: f32, %out: f32):
      %133 = arith.cmpf ogt, %in, %in_65 : f32
      %134 = arith.select %133, %in, %in_65 : f32
      linalg.yield %134 : f32
    } -> tensor<1x256x56x56xf32>
    %31 = linalg.generic {indexing_maps = [affine_map<(d0, d1, d2, d3) -> ()>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>], iterator_types = ["parallel", "parallel", "parallel", "parallel"]} ins(%4, %29 : tensor<f32>, tensor<1x256x56x56xf32>) outs(%28 : tensor<1x256x56x56xf32>) {
    ^bb0(%in: f32, %in_65: f32, %out: f32):
      %133 = arith.cmpf olt, %in, %in_65 : f32
      %134 = arith.select %133, %in, %in_65 : f32
      linalg.yield %134 : f32
    } -> tensor<1x256x56x56xf32>
    %32 = linalg.generic {indexing_maps = [affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>], iterator_types = ["parallel", "parallel", "parallel", "parallel"]} ins(%31 : tensor<1x256x56x56xf32>) outs(%28 : tensor<1x256x56x56xf32>) {
    ^bb0(%in: f32, %out: f32):
      %133 = arith.mulf %in, %cst_26 : f32
      linalg.yield %133 : f32
    } -> tensor<1x256x56x56xf32>
    %33 = linalg.generic {indexing_maps = [affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>], iterator_types = ["parallel", "parallel", "parallel", "parallel"]} ins(%30, %32 : tensor<1x256x56x56xf32>, tensor<1x256x56x56xf32>) outs(%28 : tensor<1x256x56x56xf32>) {
    ^bb0(%in: f32, %in_65: f32, %out: f32):
      %133 = arith.addf %in, %in_65 : f32
      linalg.yield %133 : f32
    } -> tensor<1x256x56x56xf32>
    %__auto.constant_256_256_1_1_torch.float32 = util.global.load @__auto.constant_256_256_1_1_torch.float32 : tensor<256x256x1x1xf32>
    %broadcasted_32 = linalg.broadcast ins(%cst_19 : tensor<256xf32>) outs(%28 : tensor<1x256x56x56xf32>) dimensions = [0, 2, 3] 
    %34 = linalg.conv_2d_nchw_fchw {dilations = dense<1> : vector<2xi64>, strides = dense<1> : vector<2xi64>} ins(%33, %__auto.constant_256_256_1_1_torch.float32 : tensor<1x256x56x56xf32>, tensor<256x256x1x1xf32>) outs(%broadcasted_32 : tensor<1x256x56x56xf32>) -> tensor<1x256x56x56xf32>
    %35 = linalg.generic {indexing_maps = [affine_map<(d0, d1, d2, d3) -> ()>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>], iterator_types = ["parallel", "parallel", "parallel", "parallel"]} ins(%4, %34 : tensor<f32>, tensor<1x256x56x56xf32>) outs(%28 : tensor<1x256x56x56xf32>) {
    ^bb0(%in: f32, %in_65: f32, %out: f32):
      %133 = arith.cmpf ogt, %in, %in_65 : f32
      %134 = arith.select %133, %in, %in_65 : f32
      linalg.yield %134 : f32
    } -> tensor<1x256x56x56xf32>
    %36 = linalg.generic {indexing_maps = [affine_map<(d0, d1, d2, d3) -> ()>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>], iterator_types = ["parallel", "parallel", "parallel", "parallel"]} ins(%4, %34 : tensor<f32>, tensor<1x256x56x56xf32>) outs(%28 : tensor<1x256x56x56xf32>) {
    ^bb0(%in: f32, %in_65: f32, %out: f32):
      %133 = arith.cmpf olt, %in, %in_65 : f32
      %134 = arith.select %133, %in, %in_65 : f32
      linalg.yield %134 : f32
    } -> tensor<1x256x56x56xf32>
    %37 = linalg.generic {indexing_maps = [affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>], iterator_types = ["parallel", "parallel", "parallel", "parallel"]} ins(%36 : tensor<1x256x56x56xf32>) outs(%28 : tensor<1x256x56x56xf32>) {
    ^bb0(%in: f32, %out: f32):
      %133 = arith.mulf %in, %cst_26 : f32
      linalg.yield %133 : f32
    } -> tensor<1x256x56x56xf32>
    %38 = linalg.generic {indexing_maps = [affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>], iterator_types = ["parallel", "parallel", "parallel", "parallel"]} ins(%35, %37 : tensor<1x256x56x56xf32>, tensor<1x256x56x56xf32>) outs(%28 : tensor<1x256x56x56xf32>) {
    ^bb0(%in: f32, %in_65: f32, %out: f32):
      %133 = arith.addf %in, %in_65 : f32
      linalg.yield %133 : f32
    } -> tensor<1x256x56x56xf32>
    %__auto.constant_512_256_3_3_torch.float32 = util.global.load @__auto.constant_512_256_3_3_torch.float32 : tensor<512x256x3x3xf32>
    %padded_33 = tensor.pad %38 low[0, 0, 1, 1] high[0, 0, 1, 1] {
    ^bb0(%arg3: index, %arg4: index, %arg5: index, %arg6: index):
      tensor.yield %cst_24 : f32
    } : tensor<1x256x56x56xf32> to tensor<1x256x58x58xf32>
    %39 = tensor.empty() : tensor<1x512x56x56xf32>
    %broadcasted_34 = linalg.broadcast ins(%cst_18 : tensor<512xf32>) outs(%39 : tensor<1x512x56x56xf32>) dimensions = [0, 2, 3] 
    %40 = linalg.conv_2d_nchw_fchw {dilations = dense<1> : vector<2xi64>, strides = dense<1> : vector<2xi64>} ins(%padded_33, %__auto.constant_512_256_3_3_torch.float32 : tensor<1x256x58x58xf32>, tensor<512x256x3x3xf32>) outs(%broadcasted_34 : tensor<1x512x56x56xf32>) -> tensor<1x512x56x56xf32>
    %41 = linalg.generic {indexing_maps = [affine_map<(d0, d1, d2, d3) -> ()>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>], iterator_types = ["parallel", "parallel", "parallel", "parallel"]} ins(%4, %40 : tensor<f32>, tensor<1x512x56x56xf32>) outs(%39 : tensor<1x512x56x56xf32>) {
    ^bb0(%in: f32, %in_65: f32, %out: f32):
      %133 = arith.cmpf ogt, %in, %in_65 : f32
      %134 = arith.select %133, %in, %in_65 : f32
      linalg.yield %134 : f32
    } -> tensor<1x512x56x56xf32>
    %42 = linalg.generic {indexing_maps = [affine_map<(d0, d1, d2, d3) -> ()>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>], iterator_types = ["parallel", "parallel", "parallel", "parallel"]} ins(%4, %40 : tensor<f32>, tensor<1x512x56x56xf32>) outs(%39 : tensor<1x512x56x56xf32>) {
    ^bb0(%in: f32, %in_65: f32, %out: f32):
      %133 = arith.cmpf olt, %in, %in_65 : f32
      %134 = arith.select %133, %in, %in_65 : f32
      linalg.yield %134 : f32
    } -> tensor<1x512x56x56xf32>
    %43 = linalg.generic {indexing_maps = [affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>], iterator_types = ["parallel", "parallel", "parallel", "parallel"]} ins(%42 : tensor<1x512x56x56xf32>) outs(%39 : tensor<1x512x56x56xf32>) {
    ^bb0(%in: f32, %out: f32):
      %133 = arith.mulf %in, %cst_26 : f32
      linalg.yield %133 : f32
    } -> tensor<1x512x56x56xf32>
    %44 = linalg.generic {indexing_maps = [affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>], iterator_types = ["parallel", "parallel", "parallel", "parallel"]} ins(%41, %43 : tensor<1x512x56x56xf32>, tensor<1x512x56x56xf32>) outs(%39 : tensor<1x512x56x56xf32>) {
    ^bb0(%in: f32, %in_65: f32, %out: f32):
      %133 = arith.addf %in, %in_65 : f32
      linalg.yield %133 : f32
    } -> tensor<1x512x56x56xf32>
    %45 = tensor.empty() : tensor<1x512x28x28xf32>
    %46 = linalg.fill ins(%cst_25 : f32) outs(%45 : tensor<1x512x28x28xf32>) -> tensor<1x512x28x28xf32>
    %47 = linalg.pooling_nchw_max {dilations = dense<1> : vector<2xi64>, strides = dense<2> : vector<2xi64>} ins(%44, %11 : tensor<1x512x56x56xf32>, tensor<2x2xf32>) outs(%46 : tensor<1x512x28x28xf32>) -> tensor<1x512x28x28xf32>
    %__auto.constant_256_512_1_1_torch.float32 = util.global.load @__auto.constant_256_512_1_1_torch.float32 : tensor<256x512x1x1xf32>
    %48 = tensor.empty() : tensor<1x256x28x28xf32>
    %broadcasted_35 = linalg.broadcast ins(%cst_17 : tensor<256xf32>) outs(%48 : tensor<1x256x28x28xf32>) dimensions = [0, 2, 3] 
    %49 = linalg.conv_2d_nchw_fchw {dilations = dense<1> : vector<2xi64>, strides = dense<1> : vector<2xi64>} ins(%47, %__auto.constant_256_512_1_1_torch.float32 : tensor<1x512x28x28xf32>, tensor<256x512x1x1xf32>) outs(%broadcasted_35 : tensor<1x256x28x28xf32>) -> tensor<1x256x28x28xf32>
    %__auto.constant_512_256_3_3_torch.float32$1 = util.global.load @__auto.constant_512_256_3_3_torch.float32$1 : tensor<512x256x3x3xf32>
    %padded_36 = tensor.pad %49 low[0, 0, 1, 1] high[0, 0, 1, 1] {
    ^bb0(%arg3: index, %arg4: index, %arg5: index, %arg6: index):
      tensor.yield %cst_24 : f32
    } : tensor<1x256x28x28xf32> to tensor<1x256x30x30xf32>
    %broadcasted_37 = linalg.broadcast ins(%cst_16 : tensor<512xf32>) outs(%45 : tensor<1x512x28x28xf32>) dimensions = [0, 2, 3] 
    %50 = linalg.conv_2d_nchw_fchw {dilations = dense<1> : vector<2xi64>, strides = dense<1> : vector<2xi64>} ins(%padded_36, %__auto.constant_512_256_3_3_torch.float32$1 : tensor<1x256x30x30xf32>, tensor<512x256x3x3xf32>) outs(%broadcasted_37 : tensor<1x512x28x28xf32>) -> tensor<1x512x28x28xf32>
    %51 = linalg.generic {indexing_maps = [affine_map<(d0, d1, d2, d3) -> ()>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>], iterator_types = ["parallel", "parallel", "parallel", "parallel"]} ins(%4, %50 : tensor<f32>, tensor<1x512x28x28xf32>) outs(%45 : tensor<1x512x28x28xf32>) {
    ^bb0(%in: f32, %in_65: f32, %out: f32):
      %133 = arith.cmpf ogt, %in, %in_65 : f32
      %134 = arith.select %133, %in, %in_65 : f32
      linalg.yield %134 : f32
    } -> tensor<1x512x28x28xf32>
    %52 = linalg.generic {indexing_maps = [affine_map<(d0, d1, d2, d3) -> ()>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>], iterator_types = ["parallel", "parallel", "parallel", "parallel"]} ins(%4, %50 : tensor<f32>, tensor<1x512x28x28xf32>) outs(%45 : tensor<1x512x28x28xf32>) {
    ^bb0(%in: f32, %in_65: f32, %out: f32):
      %133 = arith.cmpf olt, %in, %in_65 : f32
      %134 = arith.select %133, %in, %in_65 : f32
      linalg.yield %134 : f32
    } -> tensor<1x512x28x28xf32>
    %53 = linalg.generic {indexing_maps = [affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>], iterator_types = ["parallel", "parallel", "parallel", "parallel"]} ins(%52 : tensor<1x512x28x28xf32>) outs(%45 : tensor<1x512x28x28xf32>) {
    ^bb0(%in: f32, %out: f32):
      %133 = arith.mulf %in, %cst_26 : f32
      linalg.yield %133 : f32
    } -> tensor<1x512x28x28xf32>
    %54 = linalg.generic {indexing_maps = [affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>], iterator_types = ["parallel", "parallel", "parallel", "parallel"]} ins(%51, %53 : tensor<1x512x28x28xf32>, tensor<1x512x28x28xf32>) outs(%45 : tensor<1x512x28x28xf32>) {
    ^bb0(%in: f32, %in_65: f32, %out: f32):
      %133 = arith.addf %in, %in_65 : f32
      linalg.yield %133 : f32
    } -> tensor<1x512x28x28xf32>
    %__auto.constant_256_512_1_1_torch.float32$1 = util.global.load @__auto.constant_256_512_1_1_torch.float32$1 : tensor<256x512x1x1xf32>
    %broadcasted_38 = linalg.broadcast ins(%cst_15 : tensor<256xf32>) outs(%48 : tensor<1x256x28x28xf32>) dimensions = [0, 2, 3] 
    %55 = linalg.conv_2d_nchw_fchw {dilations = dense<1> : vector<2xi64>, strides = dense<1> : vector<2xi64>} ins(%54, %__auto.constant_256_512_1_1_torch.float32$1 : tensor<1x512x28x28xf32>, tensor<256x512x1x1xf32>) outs(%broadcasted_38 : tensor<1x256x28x28xf32>) -> tensor<1x256x28x28xf32>
    %__auto.constant_512_256_3_3_torch.float32$2 = util.global.load @__auto.constant_512_256_3_3_torch.float32$2 : tensor<512x256x3x3xf32>
    %padded_39 = tensor.pad %55 low[0, 0, 1, 1] high[0, 0, 1, 1] {
    ^bb0(%arg3: index, %arg4: index, %arg5: index, %arg6: index):
      tensor.yield %cst_24 : f32
    } : tensor<1x256x28x28xf32> to tensor<1x256x30x30xf32>
    %broadcasted_40 = linalg.broadcast ins(%cst_14 : tensor<512xf32>) outs(%45 : tensor<1x512x28x28xf32>) dimensions = [0, 2, 3] 
    %56 = linalg.conv_2d_nchw_fchw {dilations = dense<1> : vector<2xi64>, strides = dense<1> : vector<2xi64>} ins(%padded_39, %__auto.constant_512_256_3_3_torch.float32$2 : tensor<1x256x30x30xf32>, tensor<512x256x3x3xf32>) outs(%broadcasted_40 : tensor<1x512x28x28xf32>) -> tensor<1x512x28x28xf32>
    %57 = linalg.generic {indexing_maps = [affine_map<(d0, d1, d2, d3) -> ()>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>], iterator_types = ["parallel", "parallel", "parallel", "parallel"]} ins(%4, %56 : tensor<f32>, tensor<1x512x28x28xf32>) outs(%45 : tensor<1x512x28x28xf32>) {
    ^bb0(%in: f32, %in_65: f32, %out: f32):
      %133 = arith.cmpf ogt, %in, %in_65 : f32
      %134 = arith.select %133, %in, %in_65 : f32
      linalg.yield %134 : f32
    } -> tensor<1x512x28x28xf32>
    %58 = linalg.generic {indexing_maps = [affine_map<(d0, d1, d2, d3) -> ()>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>], iterator_types = ["parallel", "parallel", "parallel", "parallel"]} ins(%4, %56 : tensor<f32>, tensor<1x512x28x28xf32>) outs(%45 : tensor<1x512x28x28xf32>) {
    ^bb0(%in: f32, %in_65: f32, %out: f32):
      %133 = arith.cmpf olt, %in, %in_65 : f32
      %134 = arith.select %133, %in, %in_65 : f32
      linalg.yield %134 : f32
    } -> tensor<1x512x28x28xf32>
    %59 = linalg.generic {indexing_maps = [affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>], iterator_types = ["parallel", "parallel", "parallel", "parallel"]} ins(%58 : tensor<1x512x28x28xf32>) outs(%45 : tensor<1x512x28x28xf32>) {
    ^bb0(%in: f32, %out: f32):
      %133 = arith.mulf %in, %cst_26 : f32
      linalg.yield %133 : f32
    } -> tensor<1x512x28x28xf32>
    %60 = linalg.generic {indexing_maps = [affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>], iterator_types = ["parallel", "parallel", "parallel", "parallel"]} ins(%57, %59 : tensor<1x512x28x28xf32>, tensor<1x512x28x28xf32>) outs(%45 : tensor<1x512x28x28xf32>) {
    ^bb0(%in: f32, %in_65: f32, %out: f32):
      %133 = arith.addf %in, %in_65 : f32
      linalg.yield %133 : f32
    } -> tensor<1x512x28x28xf32>
    %__auto.constant_256_512_1_1_torch.float32$2 = util.global.load @__auto.constant_256_512_1_1_torch.float32$2 : tensor<256x512x1x1xf32>
    %broadcasted_41 = linalg.broadcast ins(%cst_13 : tensor<256xf32>) outs(%48 : tensor<1x256x28x28xf32>) dimensions = [0, 2, 3] 
    %61 = linalg.conv_2d_nchw_fchw {dilations = dense<1> : vector<2xi64>, strides = dense<1> : vector<2xi64>} ins(%60, %__auto.constant_256_512_1_1_torch.float32$2 : tensor<1x512x28x28xf32>, tensor<256x512x1x1xf32>) outs(%broadcasted_41 : tensor<1x256x28x28xf32>) -> tensor<1x256x28x28xf32>
    %__auto.constant_512_256_3_3_torch.float32$3 = util.global.load @__auto.constant_512_256_3_3_torch.float32$3 : tensor<512x256x3x3xf32>
    %padded_42 = tensor.pad %61 low[0, 0, 1, 1] high[0, 0, 1, 1] {
    ^bb0(%arg3: index, %arg4: index, %arg5: index, %arg6: index):
      tensor.yield %cst_24 : f32
    } : tensor<1x256x28x28xf32> to tensor<1x256x30x30xf32>
    %broadcasted_43 = linalg.broadcast ins(%cst_12 : tensor<512xf32>) outs(%45 : tensor<1x512x28x28xf32>) dimensions = [0, 2, 3] 
    %62 = linalg.conv_2d_nchw_fchw {dilations = dense<1> : vector<2xi64>, strides = dense<1> : vector<2xi64>} ins(%padded_42, %__auto.constant_512_256_3_3_torch.float32$3 : tensor<1x256x30x30xf32>, tensor<512x256x3x3xf32>) outs(%broadcasted_43 : tensor<1x512x28x28xf32>) -> tensor<1x512x28x28xf32>
    %63 = linalg.generic {indexing_maps = [affine_map<(d0, d1, d2, d3) -> ()>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>], iterator_types = ["parallel", "parallel", "parallel", "parallel"]} ins(%4, %62 : tensor<f32>, tensor<1x512x28x28xf32>) outs(%45 : tensor<1x512x28x28xf32>) {
    ^bb0(%in: f32, %in_65: f32, %out: f32):
      %133 = arith.cmpf ogt, %in, %in_65 : f32
      %134 = arith.select %133, %in, %in_65 : f32
      linalg.yield %134 : f32
    } -> tensor<1x512x28x28xf32>
    %64 = linalg.generic {indexing_maps = [affine_map<(d0, d1, d2, d3) -> ()>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>], iterator_types = ["parallel", "parallel", "parallel", "parallel"]} ins(%4, %62 : tensor<f32>, tensor<1x512x28x28xf32>) outs(%45 : tensor<1x512x28x28xf32>) {
    ^bb0(%in: f32, %in_65: f32, %out: f32):
      %133 = arith.cmpf olt, %in, %in_65 : f32
      %134 = arith.select %133, %in, %in_65 : f32
      linalg.yield %134 : f32
    } -> tensor<1x512x28x28xf32>
    %65 = linalg.generic {indexing_maps = [affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>], iterator_types = ["parallel", "parallel", "parallel", "parallel"]} ins(%64 : tensor<1x512x28x28xf32>) outs(%45 : tensor<1x512x28x28xf32>) {
    ^bb0(%in: f32, %out: f32):
      %133 = arith.mulf %in, %cst_26 : f32
      linalg.yield %133 : f32
    } -> tensor<1x512x28x28xf32>
    %66 = linalg.generic {indexing_maps = [affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>], iterator_types = ["parallel", "parallel", "parallel", "parallel"]} ins(%63, %65 : tensor<1x512x28x28xf32>, tensor<1x512x28x28xf32>) outs(%45 : tensor<1x512x28x28xf32>) {
    ^bb0(%in: f32, %in_65: f32, %out: f32):
      %133 = arith.addf %in, %in_65 : f32
      linalg.yield %133 : f32
    } -> tensor<1x512x28x28xf32>
    %__auto.constant_256_512_1_1_torch.float32$3 = util.global.load @__auto.constant_256_512_1_1_torch.float32$3 : tensor<256x512x1x1xf32>
    %broadcasted_44 = linalg.broadcast ins(%cst_11 : tensor<256xf32>) outs(%48 : tensor<1x256x28x28xf32>) dimensions = [0, 2, 3] 
    %67 = linalg.conv_2d_nchw_fchw {dilations = dense<1> : vector<2xi64>, strides = dense<1> : vector<2xi64>} ins(%66, %__auto.constant_256_512_1_1_torch.float32$3 : tensor<1x512x28x28xf32>, tensor<256x512x1x1xf32>) outs(%broadcasted_44 : tensor<1x256x28x28xf32>) -> tensor<1x256x28x28xf32>
    %__auto.constant_512_256_3_3_torch.float32$4 = util.global.load @__auto.constant_512_256_3_3_torch.float32$4 : tensor<512x256x3x3xf32>
    %padded_45 = tensor.pad %67 low[0, 0, 1, 1] high[0, 0, 1, 1] {
    ^bb0(%arg3: index, %arg4: index, %arg5: index, %arg6: index):
      tensor.yield %cst_24 : f32
    } : tensor<1x256x28x28xf32> to tensor<1x256x30x30xf32>
    %broadcasted_46 = linalg.broadcast ins(%cst_10 : tensor<512xf32>) outs(%45 : tensor<1x512x28x28xf32>) dimensions = [0, 2, 3] 
    %68 = linalg.conv_2d_nchw_fchw {dilations = dense<1> : vector<2xi64>, strides = dense<1> : vector<2xi64>} ins(%padded_45, %__auto.constant_512_256_3_3_torch.float32$4 : tensor<1x256x30x30xf32>, tensor<512x256x3x3xf32>) outs(%broadcasted_46 : tensor<1x512x28x28xf32>) -> tensor<1x512x28x28xf32>
    %69 = linalg.generic {indexing_maps = [affine_map<(d0, d1, d2, d3) -> ()>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>], iterator_types = ["parallel", "parallel", "parallel", "parallel"]} ins(%4, %68 : tensor<f32>, tensor<1x512x28x28xf32>) outs(%45 : tensor<1x512x28x28xf32>) {
    ^bb0(%in: f32, %in_65: f32, %out: f32):
      %133 = arith.cmpf ogt, %in, %in_65 : f32
      %134 = arith.select %133, %in, %in_65 : f32
      linalg.yield %134 : f32
    } -> tensor<1x512x28x28xf32>
    %70 = linalg.generic {indexing_maps = [affine_map<(d0, d1, d2, d3) -> ()>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>], iterator_types = ["parallel", "parallel", "parallel", "parallel"]} ins(%4, %68 : tensor<f32>, tensor<1x512x28x28xf32>) outs(%45 : tensor<1x512x28x28xf32>) {
    ^bb0(%in: f32, %in_65: f32, %out: f32):
      %133 = arith.cmpf olt, %in, %in_65 : f32
      %134 = arith.select %133, %in, %in_65 : f32
      linalg.yield %134 : f32
    } -> tensor<1x512x28x28xf32>
    %71 = linalg.generic {indexing_maps = [affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>], iterator_types = ["parallel", "parallel", "parallel", "parallel"]} ins(%70 : tensor<1x512x28x28xf32>) outs(%45 : tensor<1x512x28x28xf32>) {
    ^bb0(%in: f32, %out: f32):
      %133 = arith.mulf %in, %cst_26 : f32
      linalg.yield %133 : f32
    } -> tensor<1x512x28x28xf32>
    %72 = linalg.generic {indexing_maps = [affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>], iterator_types = ["parallel", "parallel", "parallel", "parallel"]} ins(%69, %71 : tensor<1x512x28x28xf32>, tensor<1x512x28x28xf32>) outs(%45 : tensor<1x512x28x28xf32>) {
    ^bb0(%in: f32, %in_65: f32, %out: f32):
      %133 = arith.addf %in, %in_65 : f32
      linalg.yield %133 : f32
    } -> tensor<1x512x28x28xf32>
    %__auto.constant_512_512_1_1_torch.float32 = util.global.load @__auto.constant_512_512_1_1_torch.float32 : tensor<512x512x1x1xf32>
    %broadcasted_47 = linalg.broadcast ins(%cst_9 : tensor<512xf32>) outs(%45 : tensor<1x512x28x28xf32>) dimensions = [0, 2, 3] 
    %73 = linalg.conv_2d_nchw_fchw {dilations = dense<1> : vector<2xi64>, strides = dense<1> : vector<2xi64>} ins(%72, %__auto.constant_512_512_1_1_torch.float32 : tensor<1x512x28x28xf32>, tensor<512x512x1x1xf32>) outs(%broadcasted_47 : tensor<1x512x28x28xf32>) -> tensor<1x512x28x28xf32>
    %__auto.constant_1024_512_3_3_torch.float32 = util.global.load @__auto.constant_1024_512_3_3_torch.float32 : tensor<1024x512x3x3xf32>
    %padded_48 = tensor.pad %73 low[0, 0, 1, 1] high[0, 0, 1, 1] {
    ^bb0(%arg3: index, %arg4: index, %arg5: index, %arg6: index):
      tensor.yield %cst_24 : f32
    } : tensor<1x512x28x28xf32> to tensor<1x512x30x30xf32>
    %74 = tensor.empty() : tensor<1x1024x28x28xf32>
    %broadcasted_49 = linalg.broadcast ins(%cst_8 : tensor<1024xf32>) outs(%74 : tensor<1x1024x28x28xf32>) dimensions = [0, 2, 3] 
    %75 = linalg.conv_2d_nchw_fchw {dilations = dense<1> : vector<2xi64>, strides = dense<1> : vector<2xi64>} ins(%padded_48, %__auto.constant_1024_512_3_3_torch.float32 : tensor<1x512x30x30xf32>, tensor<1024x512x3x3xf32>) outs(%broadcasted_49 : tensor<1x1024x28x28xf32>) -> tensor<1x1024x28x28xf32>
    %76 = linalg.generic {indexing_maps = [affine_map<(d0, d1, d2, d3) -> ()>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>], iterator_types = ["parallel", "parallel", "parallel", "parallel"]} ins(%4, %75 : tensor<f32>, tensor<1x1024x28x28xf32>) outs(%74 : tensor<1x1024x28x28xf32>) {
    ^bb0(%in: f32, %in_65: f32, %out: f32):
      %133 = arith.cmpf ogt, %in, %in_65 : f32
      %134 = arith.select %133, %in, %in_65 : f32
      linalg.yield %134 : f32
    } -> tensor<1x1024x28x28xf32>
    %77 = linalg.generic {indexing_maps = [affine_map<(d0, d1, d2, d3) -> ()>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>], iterator_types = ["parallel", "parallel", "parallel", "parallel"]} ins(%4, %75 : tensor<f32>, tensor<1x1024x28x28xf32>) outs(%74 : tensor<1x1024x28x28xf32>) {
    ^bb0(%in: f32, %in_65: f32, %out: f32):
      %133 = arith.cmpf olt, %in, %in_65 : f32
      %134 = arith.select %133, %in, %in_65 : f32
      linalg.yield %134 : f32
    } -> tensor<1x1024x28x28xf32>
    %78 = linalg.generic {indexing_maps = [affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>], iterator_types = ["parallel", "parallel", "parallel", "parallel"]} ins(%77 : tensor<1x1024x28x28xf32>) outs(%74 : tensor<1x1024x28x28xf32>) {
    ^bb0(%in: f32, %out: f32):
      %133 = arith.mulf %in, %cst_26 : f32
      linalg.yield %133 : f32
    } -> tensor<1x1024x28x28xf32>
    %79 = linalg.generic {indexing_maps = [affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>], iterator_types = ["parallel", "parallel", "parallel", "parallel"]} ins(%76, %78 : tensor<1x1024x28x28xf32>, tensor<1x1024x28x28xf32>) outs(%74 : tensor<1x1024x28x28xf32>) {
    ^bb0(%in: f32, %in_65: f32, %out: f32):
      %133 = arith.addf %in, %in_65 : f32
      linalg.yield %133 : f32
    } -> tensor<1x1024x28x28xf32>
    %80 = tensor.empty() : tensor<1x1024x14x14xf32>
    %81 = linalg.fill ins(%cst_25 : f32) outs(%80 : tensor<1x1024x14x14xf32>) -> tensor<1x1024x14x14xf32>
    %82 = linalg.pooling_nchw_max {dilations = dense<1> : vector<2xi64>, strides = dense<2> : vector<2xi64>} ins(%79, %11 : tensor<1x1024x28x28xf32>, tensor<2x2xf32>) outs(%81 : tensor<1x1024x14x14xf32>) -> tensor<1x1024x14x14xf32>
    %__auto.constant_512_1024_1_1_torch.float32 = util.global.load @__auto.constant_512_1024_1_1_torch.float32 : tensor<512x1024x1x1xf32>
    %83 = tensor.empty() : tensor<1x512x14x14xf32>
    %broadcasted_50 = linalg.broadcast ins(%cst_7 : tensor<512xf32>) outs(%83 : tensor<1x512x14x14xf32>) dimensions = [0, 2, 3] 
    %84 = linalg.conv_2d_nchw_fchw {dilations = dense<1> : vector<2xi64>, strides = dense<1> : vector<2xi64>} ins(%82, %__auto.constant_512_1024_1_1_torch.float32 : tensor<1x1024x14x14xf32>, tensor<512x1024x1x1xf32>) outs(%broadcasted_50 : tensor<1x512x14x14xf32>) -> tensor<1x512x14x14xf32>
    %__auto.constant_1024_512_3_3_torch.float32$1 = util.global.load @__auto.constant_1024_512_3_3_torch.float32$1 : tensor<1024x512x3x3xf32>
    %padded_51 = tensor.pad %84 low[0, 0, 1, 1] high[0, 0, 1, 1] {
    ^bb0(%arg3: index, %arg4: index, %arg5: index, %arg6: index):
      tensor.yield %cst_24 : f32
    } : tensor<1x512x14x14xf32> to tensor<1x512x16x16xf32>
    %broadcasted_52 = linalg.broadcast ins(%cst_6 : tensor<1024xf32>) outs(%80 : tensor<1x1024x14x14xf32>) dimensions = [0, 2, 3] 
    %85 = linalg.conv_2d_nchw_fchw {dilations = dense<1> : vector<2xi64>, strides = dense<1> : vector<2xi64>} ins(%padded_51, %__auto.constant_1024_512_3_3_torch.float32$1 : tensor<1x512x16x16xf32>, tensor<1024x512x3x3xf32>) outs(%broadcasted_52 : tensor<1x1024x14x14xf32>) -> tensor<1x1024x14x14xf32>
    %86 = linalg.generic {indexing_maps = [affine_map<(d0, d1, d2, d3) -> ()>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>], iterator_types = ["parallel", "parallel", "parallel", "parallel"]} ins(%4, %85 : tensor<f32>, tensor<1x1024x14x14xf32>) outs(%80 : tensor<1x1024x14x14xf32>) {
    ^bb0(%in: f32, %in_65: f32, %out: f32):
      %133 = arith.cmpf ogt, %in, %in_65 : f32
      %134 = arith.select %133, %in, %in_65 : f32
      linalg.yield %134 : f32
    } -> tensor<1x1024x14x14xf32>
    %87 = linalg.generic {indexing_maps = [affine_map<(d0, d1, d2, d3) -> ()>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>], iterator_types = ["parallel", "parallel", "parallel", "parallel"]} ins(%4, %85 : tensor<f32>, tensor<1x1024x14x14xf32>) outs(%80 : tensor<1x1024x14x14xf32>) {
    ^bb0(%in: f32, %in_65: f32, %out: f32):
      %133 = arith.cmpf olt, %in, %in_65 : f32
      %134 = arith.select %133, %in, %in_65 : f32
      linalg.yield %134 : f32
    } -> tensor<1x1024x14x14xf32>
    %88 = linalg.generic {indexing_maps = [affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>], iterator_types = ["parallel", "parallel", "parallel", "parallel"]} ins(%87 : tensor<1x1024x14x14xf32>) outs(%80 : tensor<1x1024x14x14xf32>) {
    ^bb0(%in: f32, %out: f32):
      %133 = arith.mulf %in, %cst_26 : f32
      linalg.yield %133 : f32
    } -> tensor<1x1024x14x14xf32>
    %89 = linalg.generic {indexing_maps = [affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>], iterator_types = ["parallel", "parallel", "parallel", "parallel"]} ins(%86, %88 : tensor<1x1024x14x14xf32>, tensor<1x1024x14x14xf32>) outs(%80 : tensor<1x1024x14x14xf32>) {
    ^bb0(%in: f32, %in_65: f32, %out: f32):
      %133 = arith.addf %in, %in_65 : f32
      linalg.yield %133 : f32
    } -> tensor<1x1024x14x14xf32>
    %__auto.constant_512_1024_1_1_torch.float32$1 = util.global.load @__auto.constant_512_1024_1_1_torch.float32$1 : tensor<512x1024x1x1xf32>
    %broadcasted_53 = linalg.broadcast ins(%cst_5 : tensor<512xf32>) outs(%83 : tensor<1x512x14x14xf32>) dimensions = [0, 2, 3] 
    %90 = linalg.conv_2d_nchw_fchw {dilations = dense<1> : vector<2xi64>, strides = dense<1> : vector<2xi64>} ins(%89, %__auto.constant_512_1024_1_1_torch.float32$1 : tensor<1x1024x14x14xf32>, tensor<512x1024x1x1xf32>) outs(%broadcasted_53 : tensor<1x512x14x14xf32>) -> tensor<1x512x14x14xf32>
    %__auto.constant_1024_512_3_3_torch.float32$2 = util.global.load @__auto.constant_1024_512_3_3_torch.float32$2 : tensor<1024x512x3x3xf32>
    %padded_54 = tensor.pad %90 low[0, 0, 1, 1] high[0, 0, 1, 1] {
    ^bb0(%arg3: index, %arg4: index, %arg5: index, %arg6: index):
      tensor.yield %cst_24 : f32
    } : tensor<1x512x14x14xf32> to tensor<1x512x16x16xf32>
    %broadcasted_55 = linalg.broadcast ins(%cst_4 : tensor<1024xf32>) outs(%80 : tensor<1x1024x14x14xf32>) dimensions = [0, 2, 3] 
    %91 = linalg.conv_2d_nchw_fchw {dilations = dense<1> : vector<2xi64>, strides = dense<1> : vector<2xi64>} ins(%padded_54, %__auto.constant_1024_512_3_3_torch.float32$2 : tensor<1x512x16x16xf32>, tensor<1024x512x3x3xf32>) outs(%broadcasted_55 : tensor<1x1024x14x14xf32>) -> tensor<1x1024x14x14xf32>
    %92 = linalg.generic {indexing_maps = [affine_map<(d0, d1, d2, d3) -> ()>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>], iterator_types = ["parallel", "parallel", "parallel", "parallel"]} ins(%4, %91 : tensor<f32>, tensor<1x1024x14x14xf32>) outs(%80 : tensor<1x1024x14x14xf32>) {
    ^bb0(%in: f32, %in_65: f32, %out: f32):
      %133 = arith.cmpf ogt, %in, %in_65 : f32
      %134 = arith.select %133, %in, %in_65 : f32
      linalg.yield %134 : f32
    } -> tensor<1x1024x14x14xf32>
    %93 = linalg.generic {indexing_maps = [affine_map<(d0, d1, d2, d3) -> ()>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>], iterator_types = ["parallel", "parallel", "parallel", "parallel"]} ins(%4, %91 : tensor<f32>, tensor<1x1024x14x14xf32>) outs(%80 : tensor<1x1024x14x14xf32>) {
    ^bb0(%in: f32, %in_65: f32, %out: f32):
      %133 = arith.cmpf olt, %in, %in_65 : f32
      %134 = arith.select %133, %in, %in_65 : f32
      linalg.yield %134 : f32
    } -> tensor<1x1024x14x14xf32>
    %94 = linalg.generic {indexing_maps = [affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>], iterator_types = ["parallel", "parallel", "parallel", "parallel"]} ins(%93 : tensor<1x1024x14x14xf32>) outs(%80 : tensor<1x1024x14x14xf32>) {
    ^bb0(%in: f32, %out: f32):
      %133 = arith.mulf %in, %cst_26 : f32
      linalg.yield %133 : f32
    } -> tensor<1x1024x14x14xf32>
    %95 = linalg.generic {indexing_maps = [affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>], iterator_types = ["parallel", "parallel", "parallel", "parallel"]} ins(%92, %94 : tensor<1x1024x14x14xf32>, tensor<1x1024x14x14xf32>) outs(%80 : tensor<1x1024x14x14xf32>) {
    ^bb0(%in: f32, %in_65: f32, %out: f32):
      %133 = arith.addf %in, %in_65 : f32
      linalg.yield %133 : f32
    } -> tensor<1x1024x14x14xf32>
    %__auto.constant_1024_1024_3_3_torch.float32 = util.global.load @__auto.constant_1024_1024_3_3_torch.float32 : tensor<1024x1024x3x3xf32>
    %padded_56 = tensor.pad %95 low[0, 0, 1, 1] high[0, 0, 1, 1] {
    ^bb0(%arg3: index, %arg4: index, %arg5: index, %arg6: index):
      tensor.yield %cst_24 : f32
    } : tensor<1x1024x14x14xf32> to tensor<1x1024x16x16xf32>
    %broadcasted_57 = linalg.broadcast ins(%cst_3 : tensor<1024xf32>) outs(%80 : tensor<1x1024x14x14xf32>) dimensions = [0, 2, 3] 
    %96 = linalg.conv_2d_nchw_fchw {dilations = dense<1> : vector<2xi64>, strides = dense<1> : vector<2xi64>} ins(%padded_56, %__auto.constant_1024_1024_3_3_torch.float32 : tensor<1x1024x16x16xf32>, tensor<1024x1024x3x3xf32>) outs(%broadcasted_57 : tensor<1x1024x14x14xf32>) -> tensor<1x1024x14x14xf32>
    %97 = linalg.generic {indexing_maps = [affine_map<(d0, d1, d2, d3) -> ()>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>], iterator_types = ["parallel", "parallel", "parallel", "parallel"]} ins(%4, %96 : tensor<f32>, tensor<1x1024x14x14xf32>) outs(%80 : tensor<1x1024x14x14xf32>) {
    ^bb0(%in: f32, %in_65: f32, %out: f32):
      %133 = arith.cmpf ogt, %in, %in_65 : f32
      %134 = arith.select %133, %in, %in_65 : f32
      linalg.yield %134 : f32
    } -> tensor<1x1024x14x14xf32>
    %98 = linalg.generic {indexing_maps = [affine_map<(d0, d1, d2, d3) -> ()>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>], iterator_types = ["parallel", "parallel", "parallel", "parallel"]} ins(%4, %96 : tensor<f32>, tensor<1x1024x14x14xf32>) outs(%80 : tensor<1x1024x14x14xf32>) {
    ^bb0(%in: f32, %in_65: f32, %out: f32):
      %133 = arith.cmpf olt, %in, %in_65 : f32
      %134 = arith.select %133, %in, %in_65 : f32
      linalg.yield %134 : f32
    } -> tensor<1x1024x14x14xf32>
    %99 = linalg.generic {indexing_maps = [affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>], iterator_types = ["parallel", "parallel", "parallel", "parallel"]} ins(%98 : tensor<1x1024x14x14xf32>) outs(%80 : tensor<1x1024x14x14xf32>) {
    ^bb0(%in: f32, %out: f32):
      %133 = arith.mulf %in, %cst_26 : f32
      linalg.yield %133 : f32
    } -> tensor<1x1024x14x14xf32>
    %100 = linalg.generic {indexing_maps = [affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>], iterator_types = ["parallel", "parallel", "parallel", "parallel"]} ins(%97, %99 : tensor<1x1024x14x14xf32>, tensor<1x1024x14x14xf32>) outs(%80 : tensor<1x1024x14x14xf32>) {
    ^bb0(%in: f32, %in_65: f32, %out: f32):
      %133 = arith.addf %in, %in_65 : f32
      linalg.yield %133 : f32
    } -> tensor<1x1024x14x14xf32>
    %__auto.constant_1024_1024_3_3_torch.float32$1 = util.global.load @__auto.constant_1024_1024_3_3_torch.float32$1 : tensor<1024x1024x3x3xf32>
    %padded_58 = tensor.pad %100 low[0, 0, 1, 1] high[0, 0, 1, 1] {
    ^bb0(%arg3: index, %arg4: index, %arg5: index, %arg6: index):
      tensor.yield %cst_24 : f32
    } : tensor<1x1024x14x14xf32> to tensor<1x1024x16x16xf32>
    %101 = tensor.empty() : tensor<1x1024x7x7xf32>
    %broadcasted_59 = linalg.broadcast ins(%cst_2 : tensor<1024xf32>) outs(%101 : tensor<1x1024x7x7xf32>) dimensions = [0, 2, 3] 
    %102 = linalg.conv_2d_nchw_fchw {dilations = dense<1> : vector<2xi64>, strides = dense<2> : vector<2xi64>} ins(%padded_58, %__auto.constant_1024_1024_3_3_torch.float32$1 : tensor<1x1024x16x16xf32>, tensor<1024x1024x3x3xf32>) outs(%broadcasted_59 : tensor<1x1024x7x7xf32>) -> tensor<1x1024x7x7xf32>
    %103 = linalg.generic {indexing_maps = [affine_map<(d0, d1, d2, d3) -> ()>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>], iterator_types = ["parallel", "parallel", "parallel", "parallel"]} ins(%4, %102 : tensor<f32>, tensor<1x1024x7x7xf32>) outs(%101 : tensor<1x1024x7x7xf32>) {
    ^bb0(%in: f32, %in_65: f32, %out: f32):
      %133 = arith.cmpf ogt, %in, %in_65 : f32
      %134 = arith.select %133, %in, %in_65 : f32
      linalg.yield %134 : f32
    } -> tensor<1x1024x7x7xf32>
    %104 = linalg.generic {indexing_maps = [affine_map<(d0, d1, d2, d3) -> ()>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>], iterator_types = ["parallel", "parallel", "parallel", "parallel"]} ins(%4, %102 : tensor<f32>, tensor<1x1024x7x7xf32>) outs(%101 : tensor<1x1024x7x7xf32>) {
    ^bb0(%in: f32, %in_65: f32, %out: f32):
      %133 = arith.cmpf olt, %in, %in_65 : f32
      %134 = arith.select %133, %in, %in_65 : f32
      linalg.yield %134 : f32
    } -> tensor<1x1024x7x7xf32>
    %105 = linalg.generic {indexing_maps = [affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>], iterator_types = ["parallel", "parallel", "parallel", "parallel"]} ins(%104 : tensor<1x1024x7x7xf32>) outs(%101 : tensor<1x1024x7x7xf32>) {
    ^bb0(%in: f32, %out: f32):
      %133 = arith.mulf %in, %cst_26 : f32
      linalg.yield %133 : f32
    } -> tensor<1x1024x7x7xf32>
    %106 = linalg.generic {indexing_maps = [affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>], iterator_types = ["parallel", "parallel", "parallel", "parallel"]} ins(%103, %105 : tensor<1x1024x7x7xf32>, tensor<1x1024x7x7xf32>) outs(%101 : tensor<1x1024x7x7xf32>) {
    ^bb0(%in: f32, %in_65: f32, %out: f32):
      %133 = arith.addf %in, %in_65 : f32
      linalg.yield %133 : f32
    } -> tensor<1x1024x7x7xf32>
    %__auto.constant_1024_1024_3_3_torch.float32$2 = util.global.load @__auto.constant_1024_1024_3_3_torch.float32$2 : tensor<1024x1024x3x3xf32>
    %padded_60 = tensor.pad %106 low[0, 0, 1, 1] high[0, 0, 1, 1] {
    ^bb0(%arg3: index, %arg4: index, %arg5: index, %arg6: index):
      tensor.yield %cst_24 : f32
    } : tensor<1x1024x7x7xf32> to tensor<1x1024x9x9xf32>
    %broadcasted_61 = linalg.broadcast ins(%cst_1 : tensor<1024xf32>) outs(%101 : tensor<1x1024x7x7xf32>) dimensions = [0, 2, 3] 
    %107 = linalg.conv_2d_nchw_fchw {dilations = dense<1> : vector<2xi64>, strides = dense<1> : vector<2xi64>} ins(%padded_60, %__auto.constant_1024_1024_3_3_torch.float32$2 : tensor<1x1024x9x9xf32>, tensor<1024x1024x3x3xf32>) outs(%broadcasted_61 : tensor<1x1024x7x7xf32>) -> tensor<1x1024x7x7xf32>
    %108 = linalg.generic {indexing_maps = [affine_map<(d0, d1, d2, d3) -> ()>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>], iterator_types = ["parallel", "parallel", "parallel", "parallel"]} ins(%4, %107 : tensor<f32>, tensor<1x1024x7x7xf32>) outs(%101 : tensor<1x1024x7x7xf32>) {
    ^bb0(%in: f32, %in_65: f32, %out: f32):
      %133 = arith.cmpf ogt, %in, %in_65 : f32
      %134 = arith.select %133, %in, %in_65 : f32
      linalg.yield %134 : f32
    } -> tensor<1x1024x7x7xf32>
    %109 = linalg.generic {indexing_maps = [affine_map<(d0, d1, d2, d3) -> ()>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>], iterator_types = ["parallel", "parallel", "parallel", "parallel"]} ins(%4, %107 : tensor<f32>, tensor<1x1024x7x7xf32>) outs(%101 : tensor<1x1024x7x7xf32>) {
    ^bb0(%in: f32, %in_65: f32, %out: f32):
      %133 = arith.cmpf olt, %in, %in_65 : f32
      %134 = arith.select %133, %in, %in_65 : f32
      linalg.yield %134 : f32
    } -> tensor<1x1024x7x7xf32>
    %110 = linalg.generic {indexing_maps = [affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>], iterator_types = ["parallel", "parallel", "parallel", "parallel"]} ins(%109 : tensor<1x1024x7x7xf32>) outs(%101 : tensor<1x1024x7x7xf32>) {
    ^bb0(%in: f32, %out: f32):
      %133 = arith.mulf %in, %cst_26 : f32
      linalg.yield %133 : f32
    } -> tensor<1x1024x7x7xf32>
    %111 = linalg.generic {indexing_maps = [affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>], iterator_types = ["parallel", "parallel", "parallel", "parallel"]} ins(%108, %110 : tensor<1x1024x7x7xf32>, tensor<1x1024x7x7xf32>) outs(%101 : tensor<1x1024x7x7xf32>) {
    ^bb0(%in: f32, %in_65: f32, %out: f32):
      %133 = arith.addf %in, %in_65 : f32
      linalg.yield %133 : f32
    } -> tensor<1x1024x7x7xf32>
    %__auto.constant_1024_1024_3_3_torch.float32$3 = util.global.load @__auto.constant_1024_1024_3_3_torch.float32$3 : tensor<1024x1024x3x3xf32>
    %padded_62 = tensor.pad %111 low[0, 0, 1, 1] high[0, 0, 1, 1] {
    ^bb0(%arg3: index, %arg4: index, %arg5: index, %arg6: index):
      tensor.yield %cst_24 : f32
    } : tensor<1x1024x7x7xf32> to tensor<1x1024x9x9xf32>
    %broadcasted_63 = linalg.broadcast ins(%cst_0 : tensor<1024xf32>) outs(%101 : tensor<1x1024x7x7xf32>) dimensions = [0, 2, 3] 
    %112 = linalg.conv_2d_nchw_fchw {dilations = dense<1> : vector<2xi64>, strides = dense<1> : vector<2xi64>} ins(%padded_62, %__auto.constant_1024_1024_3_3_torch.float32$3 : tensor<1x1024x9x9xf32>, tensor<1024x1024x3x3xf32>) outs(%broadcasted_63 : tensor<1x1024x7x7xf32>) -> tensor<1x1024x7x7xf32>
    %113 = linalg.generic {indexing_maps = [affine_map<(d0, d1, d2, d3) -> ()>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>], iterator_types = ["parallel", "parallel", "parallel", "parallel"]} ins(%4, %112 : tensor<f32>, tensor<1x1024x7x7xf32>) outs(%101 : tensor<1x1024x7x7xf32>) {
    ^bb0(%in: f32, %in_65: f32, %out: f32):
      %133 = arith.cmpf ogt, %in, %in_65 : f32
      %134 = arith.select %133, %in, %in_65 : f32
      linalg.yield %134 : f32
    } -> tensor<1x1024x7x7xf32>
    %114 = linalg.generic {indexing_maps = [affine_map<(d0, d1, d2, d3) -> ()>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>], iterator_types = ["parallel", "parallel", "parallel", "parallel"]} ins(%4, %112 : tensor<f32>, tensor<1x1024x7x7xf32>) outs(%101 : tensor<1x1024x7x7xf32>) {
    ^bb0(%in: f32, %in_65: f32, %out: f32):
      %133 = arith.cmpf olt, %in, %in_65 : f32
      %134 = arith.select %133, %in, %in_65 : f32
      linalg.yield %134 : f32
    } -> tensor<1x1024x7x7xf32>
    %115 = linalg.generic {indexing_maps = [affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>], iterator_types = ["parallel", "parallel", "parallel", "parallel"]} ins(%114 : tensor<1x1024x7x7xf32>) outs(%101 : tensor<1x1024x7x7xf32>) {
    ^bb0(%in: f32, %out: f32):
      %133 = arith.mulf %in, %cst_26 : f32
      linalg.yield %133 : f32
    } -> tensor<1x1024x7x7xf32>
    %116 = linalg.generic {indexing_maps = [affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>, affine_map<(d0, d1, d2, d3) -> (d0, d1, d2, d3)>], iterator_types = ["parallel", "parallel", "parallel", "parallel"]} ins(%113, %115 : tensor<1x1024x7x7xf32>, tensor<1x1024x7x7xf32>) outs(%101 : tensor<1x1024x7x7xf32>) {
    ^bb0(%in: f32, %in_65: f32, %out: f32):
      %133 = arith.addf %in, %in_65 : f32
      linalg.yield %133 : f32
    } -> tensor<1x1024x7x7xf32>
    %collapsed = tensor.collapse_shape %116 [[0], [1, 2, 3]] : tensor<1x1024x7x7xf32> into tensor<1x50176xf32>
    %__auto.constant_4096_50176_torch.float32 = util.global.load @__auto.constant_4096_50176_torch.float32 : tensor<4096x50176xf32>
    %__auto.constant_4096_torch.float32 = util.global.load @__auto.constant_4096_torch.float32 : tensor<4096xf32>
    %117 = tensor.empty() : tensor<50176x4096xf32>
    %transposed = linalg.transpose ins(%__auto.constant_4096_50176_torch.float32 : tensor<4096x50176xf32>) outs(%117 : tensor<50176x4096xf32>) permutation = [1, 0] 
    %118 = tensor.empty() : tensor<1x4096xf32>
    %119 = linalg.fill ins(%cst_24 : f32) outs(%118 : tensor<1x4096xf32>) -> tensor<1x4096xf32>
    %120 = linalg.matmul ins(%collapsed, %transposed : tensor<1x50176xf32>, tensor<50176x4096xf32>) outs(%119 : tensor<1x4096xf32>) -> tensor<1x4096xf32>
    %121 = linalg.generic {indexing_maps = [affine_map<(d0, d1) -> (d0, d1)>, affine_map<(d0, d1) -> (d1)>, affine_map<(d0, d1) -> (d0, d1)>], iterator_types = ["parallel", "parallel"]} ins(%120, %__auto.constant_4096_torch.float32 : tensor<1x4096xf32>, tensor<4096xf32>) outs(%118 : tensor<1x4096xf32>) {
    ^bb0(%in: f32, %in_65: f32, %out: f32):
      %133 = arith.addf %in, %in_65 : f32
      linalg.yield %133 : f32
    } -> tensor<1x4096xf32>
    %122 = linalg.generic {indexing_maps = [affine_map<(d0, d1) -> ()>, affine_map<(d0, d1) -> (d0, d1)>, affine_map<(d0, d1) -> (d0, d1)>], iterator_types = ["parallel", "parallel"]} ins(%4, %121 : tensor<f32>, tensor<1x4096xf32>) outs(%118 : tensor<1x4096xf32>) {
    ^bb0(%in: f32, %in_65: f32, %out: f32):
      %133 = arith.cmpf ogt, %in, %in_65 : f32
      %134 = arith.select %133, %in, %in_65 : f32
      linalg.yield %134 : f32
    } -> tensor<1x4096xf32>
    %123 = linalg.generic {indexing_maps = [affine_map<(d0, d1) -> ()>, affine_map<(d0, d1) -> (d0, d1)>, affine_map<(d0, d1) -> (d0, d1)>], iterator_types = ["parallel", "parallel"]} ins(%4, %121 : tensor<f32>, tensor<1x4096xf32>) outs(%118 : tensor<1x4096xf32>) {
    ^bb0(%in: f32, %in_65: f32, %out: f32):
      %133 = arith.cmpf olt, %in, %in_65 : f32
      %134 = arith.select %133, %in, %in_65 : f32
      linalg.yield %134 : f32
    } -> tensor<1x4096xf32>
    %124 = linalg.generic {indexing_maps = [affine_map<(d0, d1) -> (d0, d1)>, affine_map<(d0, d1) -> (d0, d1)>], iterator_types = ["parallel", "parallel"]} ins(%123 : tensor<1x4096xf32>) outs(%118 : tensor<1x4096xf32>) {
    ^bb0(%in: f32, %out: f32):
      %133 = arith.mulf %in, %cst_26 : f32
      linalg.yield %133 : f32
    } -> tensor<1x4096xf32>
    %125 = linalg.generic {indexing_maps = [affine_map<(d0, d1) -> (d0, d1)>, affine_map<(d0, d1) -> (d0, d1)>, affine_map<(d0, d1) -> (d0, d1)>], iterator_types = ["parallel", "parallel"]} ins(%122, %124 : tensor<1x4096xf32>, tensor<1x4096xf32>) outs(%118 : tensor<1x4096xf32>) {
    ^bb0(%in: f32, %in_65: f32, %out: f32):
      %133 = arith.addf %in, %in_65 : f32
      linalg.yield %133 : f32
    } -> tensor<1x4096xf32>
    %__auto.constant_1470_4096_torch.float32 = util.global.load @__auto.constant_1470_4096_torch.float32 : tensor<1470x4096xf32>
    %__auto.constant_1470_torch.float32 = util.global.load @__auto.constant_1470_torch.float32 : tensor<1470xf32>
    %126 = tensor.empty() : tensor<4096x1470xf32>
    %transposed_64 = linalg.transpose ins(%__auto.constant_1470_4096_torch.float32 : tensor<1470x4096xf32>) outs(%126 : tensor<4096x1470xf32>) permutation = [1, 0] 
    %127 = tensor.empty() : tensor<1x1470xf32>
    %128 = linalg.fill ins(%cst_24 : f32) outs(%127 : tensor<1x1470xf32>) -> tensor<1x1470xf32>
    %129 = linalg.matmul ins(%125, %transposed_64 : tensor<1x4096xf32>, tensor<4096x1470xf32>) outs(%128 : tensor<1x1470xf32>) -> tensor<1x1470xf32>
    %130 = linalg.generic {indexing_maps = [affine_map<(d0, d1) -> (d0, d1)>, affine_map<(d0, d1) -> (d1)>, affine_map<(d0, d1) -> (d0, d1)>], iterator_types = ["parallel", "parallel"]} ins(%129, %__auto.constant_1470_torch.float32 : tensor<1x1470xf32>, tensor<1470xf32>) outs(%127 : tensor<1x1470xf32>) {
    ^bb0(%in: f32, %in_65: f32, %out: f32):
      %133 = arith.addf %in, %in_65 : f32
      linalg.yield %133 : f32
    } -> tensor<1x1470xf32>
    %expanded = tensor.expand_shape %130 [[0], [1, 2, 3]] output_shape [1, 7, 7, 30] : tensor<1x1470xf32> into tensor<1x7x7x30xf32>
    %131 = hal.tensor.barrier join(%expanded : tensor<1x7x7x30xf32>) => %arg2 : !hal.fence
    %132 = hal.tensor.export %131 : tensor<1x7x7x30xf32> -> !hal.buffer_view
    util.return %132 : !hal.buffer_view
  }
  util.func public @main(%arg0: !hal.buffer_view) -> !hal.buffer_view attributes {iree.abi.stub} {
    %0 = util.null : !hal.fence
    %c-1_i32 = arith.constant -1 : i32
    %c0 = arith.constant 0 : index
    %device_0 = hal.devices.get %c0 : !hal.device
    %fence = hal.fence.create device(%device_0 : !hal.device) flags("None") : !hal.fence
    %1 = util.call @main$async(%arg0, %0, %fence) : (!hal.buffer_view, !hal.fence, !hal.fence) -> !hal.buffer_view
    %status = hal.fence.await until([%fence]) timeout_millis(%c-1_i32) flags("None") : i32
    util.return %1 : !hal.buffer_view
  }
}