#loc0 = loc("/m.0/empty")
#loc1 = loc("/m.0/Conv")
#loc2 = loc("/m.1/Add")
#loc3 = loc("/m.2/Mul")
#loc5 = loc("/m.4/BN")
#loc6 = loc("/m.4/Scale")
#loc7 = loc(fused[#loc5, #loc6])
#loc9 = loc("/m.9/New")
module {
  func.func @main() {
    %cst = arith.constant 0.0 : f32
    %0 = tensor.empty() : tensor<4xf32> loc(#loc0)
    %1 = linalg.fill ins(%cst : f32) outs(%0 : tensor<4xf32>) -> tensor<4xf32> loc(#loc1)
    %2 = linalg.fill ins(%1 : tensor<4xf32>) outs(%0 : tensor<4xf32>) -> tensor<4xf32> loc(#loc1)
    %3 = linalg.fill ins(%2 : tensor<4xf32>) outs(%0 : tensor<4xf32>) -> tensor<4xf32> loc(#loc2)
    %4 = linalg.fill ins(%3 : tensor<4xf32>) outs(%0 : tensor<8xf32>) -> tensor<8xf32> loc(#loc3)
    %5 = linalg.fill ins(%4 : tensor<8xf32>) outs(%0 : tensor<4xf32>) -> tensor<4xf32> loc(#loc7)
    %6 = linalg.fill ins(%5 : tensor<4xf32>) outs(%0 : tensor<4xf32>) -> tensor<4xf32> loc(#loc9)
    util.return
  }
}
