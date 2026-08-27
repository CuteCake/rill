#loc1 = loc("/model.0/conv/Conv")
#loc2 = loc("/model.0/bn/BatchNorm")
#loc3 = loc("/model.1/act/SiLU")
#loc4 = loc(fused[#loc1, #loc2])
#loc5 = loc(fused[#loc4, #loc3])
#loc6 = loc(fused<"pipeline">[#loc2, "/model.1/pool/MaxPool"])
#loc7 = loc(callsite(#loc1 at #loc3))
#loc8 = loc(unknown)
#loc9 = loc(fused[#loc8, #loc2])
#loc10 = loc("model.py":42:8)
module {
  func.func @main() {
    %0 = tensor.empty() : tensor<4xf32> loc(#loc4)
    %1 = linalg.fill ins(%0 : tensor<4xf32>) outs(%0 : tensor<4xf32>) -> tensor<4xf32> loc(#loc5)
    %2 = linalg.fill ins(%1 : tensor<4xf32>) outs(%0 : tensor<4xf32>) -> tensor<4xf32> loc(#loc6)
    %3 = linalg.fill ins(%2 : tensor<4xf32>) outs(%0 : tensor<4xf32>) -> tensor<4xf32> loc(#loc7)
    %4 = linalg.fill ins(%3 : tensor<4xf32>) outs(%0 : tensor<4xf32>) -> tensor<4xf32> loc(#loc9)
    %5 = linalg.fill ins(%4 : tensor<4xf32>) outs(%0 : tensor<4xf32>) -> tensor<4xf32> loc(fused["/inline.a", "/inline.b"])
    %6 = linalg.fill ins(%5 : tensor<4xf32>) outs(%0 : tensor<4xf32>) -> tensor<4xf32> loc(#loc10)
    %7 = linalg.fill ins(%6 : tensor<4xf32>) outs(%0 : tensor<4xf32>) -> tensor<4xf32> loc(#loc8)
    util.return
  }
}
