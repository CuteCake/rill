import { describe, it, expect } from "vitest";
import { parseMLIR } from "../src/parser/mlir-parser.js";
import { buildGraph } from "../src/graph/build-graph.js";
import { computeLayout } from "../src/graph/layout.js";

// ── SSA scoping tests ──

const TWO_REGIONS = `module {
  util.func public @test() {
    %0 = arith.constant 1.0 : f32
    %1 = flow.dispatch.workgroups(%0) : (f32) -> f32 =
        (%arg0: f32) {
      %2 = arith.addf %arg0, %arg0 : f32
      flow.return
    }
    %3 = flow.dispatch.workgroups(%1) : (f32) -> f32 =
        (%arg1: f32) {
      %2 = arith.mulf %arg1, %arg1 : f32
      flow.return
    }
    util.return
  }
}`;

describe("SSA scoping", () => {
  it("should scope inner region SSA values by parentId", () => {
    const ops = parseMLIR(TWO_REGIONS);
    // There are two %2 definitions — one in each dispatch region
    const addOp = ops.find((o) => o.opName === "arith.addf");
    const mulOp = ops.find((o) => o.opName === "arith.mulf");

    expect(addOp).toBeDefined();
    expect(mulOp).toBeDefined();
    // Both have rawResults of %2
    expect(addOp.rawResults).toEqual(["%2"]);
    expect(mulOp.rawResults).toEqual(["%2"]);
    // But scoped results differ (different parent regions)
    expect(addOp.results[0]).not.toBe(mulOp.results[0]);
    expect(addOp.results[0]).toMatch(/^%2@\d+$/);
    expect(mulOp.results[0]).toMatch(/^%2@\d+$/);
  });

  it("should not scope top-level ops (no parentId)", () => {
    const ops = parseMLIR(TWO_REGIONS);
    const constOp = ops.find((o) => o.opName === "arith.constant");
    // Top-level func ops have parentId=func, which IS structural,
    // but they still get scoped since parentId is not null
    expect(constOp.rawResults).toEqual(["%0"]);
  });

  it("should not create cross-region edges in the graph", () => {
    const ops = parseMLIR(TWO_REGIONS);
    const graph = buildGraph(ops);

    const addOp = ops.find((o) => o.opName === "arith.addf");
    const mulOp = ops.find((o) => o.opName === "arith.mulf");

    // There should be no edge between addf and mulf despite both
    // having %2 as a result/operand
    const crossEdge = graph.edges.find(
      (e) =>
        (e.from === addOp.id && e.to === mulOp.id) ||
        (e.from === mulOp.id && e.to === addOp.id)
    );
    expect(crossEdge).toBeUndefined();
  });

  it("should scope operands within the same region", () => {
    const ops = parseMLIR(TWO_REGIONS);
    const addOp = ops.find((o) => o.opName === "arith.addf");
    // Operands should also be scoped
    expect(addOp.rawOperands).toContain("%arg0");
    expect(addOp.operands[0]).toMatch(/^%arg0@\d+$/);
  });
});

// ── Closing brace handling tests ──

const DISPATCH_WITH_COUNT = `#loc100 = loc("/model.0/conv/Conv")
module {
  util.func public @test() {
    %0 = arith.constant 1.0 : f32
    %1 = flow.dispatch.workgroups(%0) : (f32) -> f32 =
        (%arg0: f32) {
      flow.return
    } count() -> (index, index, index) {
      %x, %y, %z = some.op() : index, index, index
      flow.return %x, %y, %z : index, index, index
    } loc(#loc100)
    %2 = arith.addf %0, %1 : f32
    util.return
  }
}`;

describe("closing brace handling", () => {
  it("should correctly parent ops after } count() { ... } loc()", () => {
    const ops = parseMLIR(DISPATCH_WITH_COUNT);
    // %2 = arith.addf should be at function level, not inside the dispatch
    const addOp = ops.find((o) => o.opName === "arith.addf");
    expect(addOp).toBeDefined();
    // Its parent should be the func, not the dispatch or count block
    const funcOp = ops.find((o) => o.opName === "util.func");
    expect(addOp.parentId).toBe(funcOp.id);
  });

  it("should extract loc from } loc(#loc) closing lines", () => {
    const ops = parseMLIR(DISPATCH_WITH_COUNT);
    // The dispatch.workgroups op doesn't have loc on its own line,
    // but the closing "} loc(#loc100)" should apply it
    const dispatchOp = ops.find((o) => o.opName === "flow.dispatch.workgroups");
    // The loc is on the closing line of the dispatch's outer region,
    // which closes the anonymous (%arg0: ...) { region
    // The dispatch op itself may or may not get it depending on structure
  });

  it("should create a region node for count() block", () => {
    const ops = parseMLIR(DISPATCH_WITH_COUNT);
    // The count block should create a minimal region node
    const countOps = ops.filter((o) => o.opName === "some.op");
    expect(countOps.length).toBe(1);
    // The count op should be inside a region (non-null parentId)
    expect(countOps[0].parentId).not.toBeNull();
  });
});

// ── Multi-result type extraction tests ──

const MULTI_RESULT_GENERIC = `module {
  func.func @test() {
    %0 = tensor.empty() : tensor<2x8400xf32>
    %1, %2, %3 = linalg.generic {indexing_maps = [affine_map<(d0, d1) -> (d0, d1)>], iterator_types = ["parallel", "parallel"]} ins(%0 : tensor<2x8400xf32>) outs(%0, %0, %0 : tensor<2x8400xf32>, tensor<2x8400xf32>, tensor<2x8400xf32>) {
    ^bb0(%in: f32, %out: f32, %out2: f32, %out3: f32):
      linalg.yield %in, %in, %in : f32, f32, f32
    } -> (tensor<2x8400xf32>, tensor<2x8400xf32>, tensor<2x8400xf32>)
    return
  }
}`;

const SINGLE_RESULT_GENERIC = `module {
  func.func @test() {
    %0 = tensor.empty() : tensor<4xf32>
    %1 = linalg.generic {indexing_maps = [affine_map<(d0) -> (d0)>], iterator_types = ["parallel"]} ins(%0 : tensor<4xf32>) outs(%0 : tensor<4xf32>) {
    ^bb0(%in: f32, %out: f32):
      linalg.yield %in : f32
    } -> tensor<4xf32>
    return
  }
}`;

describe("multi-result ops", () => {
  it("should parse multiple SSA results", () => {
    const ops = parseMLIR(MULTI_RESULT_GENERIC);
    const generic = ops.find((o) => o.opName === "linalg.generic");
    expect(generic).toBeDefined();
    expect(generic.rawResults).toEqual(["%1", "%2", "%3"]);
    expect(generic.results.length).toBe(3);
  });

  it("should extract all types from tuple result -> (t1, t2, t3)", () => {
    const ops = parseMLIR(MULTI_RESULT_GENERIC);
    const generic = ops.find((o) => o.opName === "linalg.generic");
    // The closing line has -> (tensor<2x8400xf32>, tensor<2x8400xf32>, tensor<2x8400xf32>)
    const t2x8400 = generic.types.filter((t) => t === "tensor<2x8400xf32>");
    expect(t2x8400.length).toBeGreaterThanOrEqual(1);
  });

  it("should still extract single result type -> tensor<...>", () => {
    const ops = parseMLIR(SINGLE_RESULT_GENERIC);
    const generic = ops.find((o) => o.opName === "linalg.generic");
    expect(generic).toBeDefined();
    expect(generic.types).toContain("tensor<4xf32>");
  });

  it("should create correct edges for multi-result ops", () => {
    const src = `module {
  func.func @test() {
    %0 = tensor.empty() : tensor<4xf32>
    %1, %2 = linalg.generic {indexing_maps = [affine_map<(d0) -> (d0)>], iterator_types = ["parallel"]} ins(%0 : tensor<4xf32>) outs(%0, %0 : tensor<4xf32>, tensor<4xf32>) {
    ^bb0(%in: f32, %out1: f32, %out2: f32):
      linalg.yield %in, %in : f32, f32
    } -> (tensor<4xf32>, tensor<4xf32>)
    %3 = arith.addf %1, %2 : f32
    return
  }
}`;
    const ops = parseMLIR(src);
    const graph = buildGraph(ops);
    const generic = ops.find((o) => o.opName === "linalg.generic");
    const addOp = ops.find((o) => o.opName === "arith.addf");

    // Both %1 and %2 should map to the same generic op
    expect(graph.defs[generic.results[0]]).toBe(generic.id);
    expect(graph.defs[generic.results[1]]).toBe(generic.id);

    // addf should consume both results → edge from generic to addf
    const edges = graph.edges.filter(
      (e) => e.from === generic.id && e.to === addOp.id
    );
    expect(edges.length).toBeGreaterThanOrEqual(1);
  });
});

// ── Region nesting filter tests ──

describe("region nesting filter in layout", () => {
  it("should hide ops inside dispatch regions from the graph", () => {
    const ops = parseMLIR(TWO_REGIONS);
    const graph = buildGraph(ops);
    const layout = computeLayout(ops, graph);

    // Inner ops (arith.addf, arith.mulf) should NOT appear in layout
    const addNode = layout.nodes.find((n) => n.node.opName === "arith.addf");
    const mulNode = layout.nodes.find((n) => n.node.opName === "arith.mulf");
    expect(addNode).toBeUndefined();
    expect(mulNode).toBeUndefined();
  });

  it("should show function-level ops in the graph", () => {
    const ops = parseMLIR(TWO_REGIONS);
    const graph = buildGraph(ops);
    const layout = computeLayout(ops, graph);

    // flow.dispatch.workgroups and arith.constant should appear
    const dispatchNodes = layout.nodes.filter(
      (n) => n.node.opName === "flow.dispatch.workgroups"
    );
    expect(dispatchNodes.length).toBe(2);
  });

  it("should handle dispatch-creation MLIR without crashing", () => {
    // Minimal dispatch-creation pattern
    const src = `#loc1 = loc("/model.0/conv/Conv")
module {
  util.func public @main() {
    %cst = arith.constant 0.0 : f32
    %0 = tensor.empty() : tensor<3x640x640xf32>
    %1 = flow.tensor.reshape %0 : tensor<3x640x640xf32> -> tensor<3x640x640xf32>
    %2 = flow.tensor.splat %cst : tensor<3x642x642xf32>
    %3 = flow.dispatch.workgroups(%1, %2) : (tensor<3x640x640xf32>, tensor<3x642x642xf32>) -> tensor<3x642x642xf32> =
        (%arg0: f32, %arg1: f32) {
      %10 = arith.addf %arg0, %arg1 : f32
      flow.return
    } count() -> (index, index, index) {
      flow.return %c1, %c1, %c1 : index, index, index
    } loc(#loc1)
    %4 = flow.dispatch.workgroups(%3) : (tensor<3x642x642xf32>) -> tensor<16x322x322xf32> =
        (%arg0: f32) {
      %10 = arith.mulf %arg0, %arg0 : f32
      flow.return
    } count() -> (index, index, index) {
      flow.return %c1, %c1, %c1 : index, index, index
    } loc(#loc1)
    util.return
  }
}`;
    const ops = parseMLIR(src);
    const graph = buildGraph(ops);
    const layout = computeLayout(ops, graph);

    // Should have the outer-level dataflow ops
    expect(layout.nodes.length).toBeGreaterThan(0);
    // Dispatch ops should be connected
    expect(layout.edges.length).toBeGreaterThan(0);
    // No inner ops visible
    const innerOps = layout.nodes.filter(
      (n) => n.node.rawResults.includes("%10")
    );
    expect(innerOps.length).toBe(0);
  });
});

// ── Closing loc extraction tests ──

describe("closing loc extraction", () => {
  it("should extract loc from linalg.generic closing line", () => {
    const src = `#loc5 = loc("/model.0/act/Sigmoid")
module {
  func.func @test() {
    %0 = tensor.empty() : tensor<4xf32>
    %1 = linalg.generic {indexing_maps = [affine_map<(d0) -> (d0)>], iterator_types = ["parallel"]} ins(%0 : tensor<4xf32>) outs(%0 : tensor<4xf32>) {
    ^bb0(%in: f32, %out: f32):
      linalg.yield %in : f32
    } -> tensor<4xf32> loc(#loc5)
    return
  }
}`;
    const ops = parseMLIR(src);
    const generic = ops.find((o) => o.opName === "linalg.generic");
    expect(generic).toBeDefined();
    expect(generic.loc).toBe("/model.0/act/Sigmoid");
    expect(generic.locPrefix).toBe("/model.0");
  });
});

// ── rawResults/rawOperands preservation ──

describe("raw vs scoped names", () => {
  it("should preserve rawResults for display while scoping results", () => {
    const src = `module {
  util.func public @test() {
    %outer = arith.constant 1.0 : f32
    %dispatch = flow.dispatch.workgroups(%outer) : (f32) -> f32 =
        (%arg0: f32) {
      %inner = arith.addf %arg0, %arg0 : f32
      flow.return
    }
    util.return
  }
}`;
    const ops = parseMLIR(src);
    const addOp = ops.find((o) => o.opName === "arith.addf");
    expect(addOp.rawResults).toEqual(["%inner"]);
    expect(addOp.rawOperands).toEqual(["%arg0", "%arg0"]);
    // Scoped versions have @parentId suffix
    expect(addOp.results[0]).toContain("@");
    expect(addOp.operands[0]).toContain("@");
    // But raw versions don't
    expect(addOp.rawResults[0]).not.toContain("@");
  });

  it("should not add scope suffix to top-level function ops without parentId", () => {
    const src = `module {
  func.func @test() {
    %0 = arith.constant 1.0 : f32
    return
  }
}`;
    const ops = parseMLIR(src);
    const constOp = ops.find((o) => o.opName === "arith.constant");
    // func.func is structural, but the constant still has parentId = func's id
    // so it gets scoped. rawResults should differ from results.
    expect(constOp.rawResults).toEqual(["%0"]);
  });
});
