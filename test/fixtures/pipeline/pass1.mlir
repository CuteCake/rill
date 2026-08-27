#loc0 = loc("/m.0/empty")
#loc1 = loc("/m.0/Conv")
#loc2 = loc("/m.1/Add")
#loc3 = loc("/m.2/Mul")
#loc4 = loc("/m.3/Sub")
#loc5 = loc("/m.4/BN")
#loc6 = loc("/m.4/Scale")
module {
  func.func @main() {
    %cst = arith.constant 0.0 : f32
    %0 = tensor.empty() : tensor<4xf32> loc(#loc0)
    %1 = linalg.fill ins(%cst : f32) outs(%0 : tensor<4xf32>) -> tensor<4xf32> loc(#loc1)
    %2 = linalg.fill ins(%1 : tensor<4xf32>) outs(%0 : tensor<4xf32>) -> tensor<4xf32> loc(#loc2)
    %3 = linalg.fill ins(%2 : tensor<4xf32>) outs(%0 : tensor<4xf32>) -> tensor<4xf32> loc(#loc3)
    %4 = linalg.fill ins(%3 : tensor<4xf32>) outs(%0 : tensor<4xf32>) -> tensor<4xf32> loc(#loc4)
    %5 = linalg.fill ins(%4 : tensor<4xf32>) outs(%0 : tensor<4xf32>) -> tensor<4xf32> loc(#loc5)
    %6 = linalg.fill ins(%5 : tensor<4xf32>) outs(%0 : tensor<4xf32>) -> tensor<4xf32> loc(#loc6)
    util.return
  }
}
