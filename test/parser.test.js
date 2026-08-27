import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { parseMLIR } from "../src/parser/mlir-parser.js";

const SIMPLE = `module {
  func.func @add(%a: f32, %b: f32) -> f32 {
    %0 = arith.addf %a, %b : f32
    return %0 : f32
  }
}`;

const LINALG_GENERIC = `module {
  func.func @test() {
    %0 = linalg.generic {indexing_maps = [affine_map<(d0) -> (d0)>, affine_map<(d0) -> (d0)>], iterator_types = ["parallel"]} ins(%arg0 : tensor<4xf32>) outs(%arg1 : tensor<4xf32>) {
    ^bb0(%in: f32, %out: f32):
      %1 = arith.addf %in, %out : f32
      linalg.yield %1 : f32
    } -> tensor<4xf32>
    return
  }
}`;

describe("parseMLIR", () => {
  it("should parse a simple module", () => {
    const ops = parseMLIR(SIMPLE);
    expect(ops.length).toBeGreaterThan(0);

    const moduleOp = ops.find((o) => o.opName === "module");
    expect(moduleOp).toBeDefined();
    expect(moduleOp.dialect).toBe("module");
  });

  it("should extract SSA results and operands", () => {
    const ops = parseMLIR(SIMPLE);
    const addOp = ops.find((o) => o.opName === "arith.addf");
    expect(addOp).toBeDefined();
    expect(addOp.rawResults).toEqual(["%0"]);
    expect(addOp.rawOperands).toEqual(["%a", "%b"]);
    // Scoped results/operands include parent scope suffix
    expect(addOp.results[0]).toMatch(/^%0(@\d+)?$/);
    expect(addOp.operands[0]).toMatch(/^%a(@\d+)?$/);
    expect(addOp.dialect).toBe("arith");
  });

  it("should extract types", () => {
    const ops = parseMLIR(SIMPLE);
    const addOp = ops.find((o) => o.opName === "arith.addf");
    expect(addOp.types).toContain("f32");
  });

  it("should build parent-child relationships", () => {
    const ops = parseMLIR(SIMPLE);
    const moduleOp = ops.find((o) => o.opName === "module");
    const funcOp = ops.find((o) => o.opName === "func.func");
    expect(funcOp.parentId).toBe(moduleOp.id);
    expect(moduleOp.children).toContain(funcOp.id);
  });

  it("should parse linalg.generic bodies", () => {
    const ops = parseMLIR(LINALG_GENERIC);
    const generic = ops.find((o) => o.opName === "linalg.generic");
    expect(generic).toBeDefined();
    expect(generic.genericBody).toBeDefined();
    expect(generic.genericBody.length).toBeGreaterThan(0);
    expect(generic.attrs._iters).toEqual(["parallel"]);
  });

  it("should extract func names", () => {
    const ops = parseMLIR(SIMPLE);
    const funcOp = ops.find((o) => o.opName === "func.func");
    expect(funcOp.attrs.name).toBe("@add");
  });

  it("should expand multi-result syntax %name:N into %name#0..#N-1", () => {
    const src = `module {
  func.func @test() {
    %0 = arith.constant dense<0.0> : tensor<4xf32>
    %1 = arith.constant dense<0> : tensor<4xi64>
    %t = tensor.empty() : tensor<4x16xf32>
    %2:2 = linalg.generic {indexing_maps = [affine_map<(d0, d1) -> (d0, d1)>, affine_map<(d0, d1) -> (d0)>, affine_map<(d0, d1) -> (d0)>], iterator_types = ["parallel", "reduction"]} ins(%t : tensor<4x16xf32>) outs(%0, %1 : tensor<4xf32>, tensor<4xi64>) {
    ^bb0(%in: f32, %out: f32, %out_1: i64):
      linalg.yield %in, %out_1 : f32, i64
    } -> (tensor<4xf32>, tensor<4xi64>)
    %3 = tensor.expand_shape %2#0 [[0, 1]] output_shape [4, 1] : tensor<4xf32> into tensor<4x1xf32>
    %4 = arith.index_cast %2#1 : tensor<4xi64> to tensor<4xindex>
  }
}`;
    const ops = parseMLIR(src);
    const generic = ops.find((o) => o.opName === "linalg.generic");
    expect(generic).toBeDefined();
    // Should expand %2:2 into %2#0 and %2#1
    expect(generic.rawResults).toEqual(["%2#0", "%2#1"]);

    const expand = ops.find((o) => o.opName === "tensor.expand_shape");
    expect(expand).toBeDefined();
    expect(expand.rawOperands).toContain("%2#0");

    const cast = ops.find((o) => o.opName === "arith.index_cast");
    expect(cast).toBeDefined();
    expect(cast.rawOperands).toContain("%2#1");
  });

  it("should handle a large real-world MLIR file", () => {
    const src = readFileSync(
      new URL("./fixtures/yolo-backbone.mlir", import.meta.url),
      "utf-8"
    );
    const ops = parseMLIR(src);
    expect(ops.length).toBeGreaterThan(100);

    // Should have linalg ops
    const linalgOps = ops.filter((o) => o.dialect === "linalg");
    expect(linalgOps.length).toBeGreaterThan(0);

    // Should have conv ops
    const convOps = ops.filter((o) => o.opName.includes("conv"));
    expect(convOps.length).toBeGreaterThan(0);

    // Should have generics with bodies
    const generics = ops.filter((o) => o.opName === "linalg.generic");
    expect(generics.length).toBeGreaterThan(0);
    for (const g of generics) {
      expect(g.genericBody).toBeDefined();
      expect(g.genericBody.length).toBeGreaterThan(0);
    }
  });
});
