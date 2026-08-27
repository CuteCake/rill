import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { parseMLIR } from "../src/parser/mlir-parser.js";
import { buildGraph, getHighlightedNodes } from "../src/graph/build-graph.js";
import { computeLayout, isAuxiliaryOp } from "../src/graph/layout.js";
import { inferGenericPurpose } from "../src/parser/infer-generic.js";

const MATMUL = `module {
  util.func public @matmul() {
    %cst = arith.constant 0.0 : f32
    %0 = tensor.empty() : tensor<4x8xf32>
    %1 = tensor.empty() : tensor<8x4xf32>
    %2 = tensor.empty() : tensor<4x4xf32>
    %3 = linalg.fill ins(%cst : f32) outs(%2 : tensor<4x4xf32>) -> tensor<4x4xf32>
    %4 = linalg.matmul ins(%0, %1 : tensor<4x8xf32>, tensor<8x4xf32>) outs(%3 : tensor<4x4xf32>) -> tensor<4x4xf32>
    util.return
  }
}`;

describe("buildGraph", () => {
  it("should build def-use edges", () => {
    const ops = parseMLIR(MATMUL);
    const graph = buildGraph(ops);

    expect(Object.keys(graph.defs).length).toBeGreaterThan(0);
    expect(graph.edges.length).toBeGreaterThan(0);

    // %3 (fill result) should be used by matmul
    const fillOp = ops.find((o) => o.opName === "linalg.fill");
    const matmulOp = ops.find((o) => o.opName === "linalg.matmul");
    const fillResult = fillOp.results[0];
    expect(graph.defs[fillResult]).toBe(fillOp.id);
    expect(graph.uses[fillResult]).toContain(matmulOp.id);
  });

  it("should compute highlighted nodes", () => {
    const ops = parseMLIR(MATMUL);
    const graph = buildGraph(ops);
    const fillOp = ops.find((o) => o.opName === "linalg.fill");
    const fillResult = fillOp.results[0];

    const hiNodes = getHighlightedNodes([fillResult], graph);
    expect(hiNodes.has(fillOp.id)).toBe(true);
    expect(hiNodes.size).toBeGreaterThan(1); // def + at least one use
  });
});

describe("isAuxiliaryOp", () => {
  it("should mark constants as auxiliary", () => {
    const ops = parseMLIR(MATMUL);
    const constOp = ops.find((o) => o.opName === "arith.constant");
    expect(isAuxiliaryOp(constOp)).toBe(true);
  });

  it("should not mark matmul as auxiliary", () => {
    const ops = parseMLIR(MATMUL);
    const matmulOp = ops.find((o) => o.opName === "linalg.matmul");
    expect(isAuxiliaryOp(matmulOp)).toBe(false);
  });
});

describe("computeLayout", () => {
  it("should produce a layout with no overlapping nodes", () => {
    const ops = parseMLIR(MATMUL);
    const graph = buildGraph(ops);
    const layout = computeLayout(ops, graph);

    // Should have at least the matmul node
    expect(layout.nodes.length).toBeGreaterThan(0);

    // No overlapping positions
    for (let i = 0; i < layout.nodes.length; i++) {
      for (let j = i + 1; j < layout.nodes.length; j++) {
        const a = layout.nodes[i];
        const b = layout.nodes[j];
        const overlap =
          a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
        expect(overlap).toBe(false);
      }
    }
  });

  it("should handle large MLIR without crashing", () => {
    const src = readFileSync(
      new URL("./fixtures/yolo-backbone.mlir", import.meta.url),
      "utf-8"
    );
    const ops = parseMLIR(src);
    const graph = buildGraph(ops);
    const layout = computeLayout(ops, graph);

    expect(layout.nodes.length).toBeGreaterThan(20);
    expect(layout.edges.length).toBeGreaterThan(10);
    expect(layout.w).toBeGreaterThan(0);
    expect(layout.h).toBeGreaterThan(0);
  });

  it("should collapse auxiliary ops from the graph", () => {
    const src = readFileSync(
      new URL("./fixtures/yolo-backbone.mlir", import.meta.url),
      "utf-8"
    );
    const ops = parseMLIR(src);
    const graph = buildGraph(ops);
    // With showAux=false, auxiliary ops should be collapsed
    const collapsed = computeLayout(ops, graph, false);
    expect(collapsed.nodes.length).toBeLessThan(ops.length);
    for (const n of collapsed.nodes) {
      expect(n.node.opName).not.toBe("arith.constant");
      expect(n.node.opName).not.toBe("tensor.empty");
    }

    // With showAux=true (default), auxiliary ops appear as mini nodes
    const expanded = computeLayout(ops, graph, true);
    expect(expanded.nodes.length).toBeGreaterThan(collapsed.nodes.length);
    const auxNodes = expanded.nodes.filter((n) => n.isAux);
    expect(auxNodes.length).toBeGreaterThan(0);
    // Aux nodes use full width for layout spacing but shorter height
    for (const n of auxNodes) {
      expect(n.w).toBe(expanded.NW);
      expect(n.h).toBeLessThan(expanded.NH);
    }
  });
});

describe("parseMLIR loc parsing", () => {
  const LOC_SAMPLE = `#loc3 = loc("/model.0/conv/weight")
#loc4 = loc("/model.0/conv/Conv")
#loc = loc(unknown)
module {
  func.func @main() {
    %0 = arith.constant dense<1.0> : tensor<3xf32> loc(#loc3)
    %1 = arith.constant dense<2.0> : tensor<3xf32> loc(#loc4)
    %2 = arith.constant dense<3.0> : tensor<3xf32>
    util.return
  }
}`;

  it("should extract loc and locPrefix from ops", () => {
    const ops = parseMLIR(LOC_SAMPLE);
    const op0 = ops.find((o) => o.rawResults.includes("%0"));
    const op1 = ops.find((o) => o.rawResults.includes("%1"));
    const op2 = ops.find((o) => o.rawResults.includes("%2"));

    expect(op0.loc).toBe("/model.0/conv/weight");
    expect(op0.locPrefix).toBe("/model.0");
    expect(op1.loc).toBe("/model.0/conv/Conv");
    expect(op1.locPrefix).toBe("/model.0");
    expect(op2.loc).toBeNull();
    expect(op2.locPrefix).toBeNull();
  });

  it("should build locAliases map", () => {
    const ops = parseMLIR(LOC_SAMPLE);
    expect(ops.locAliases).toBeDefined();
    expect(ops.locAliases.get("#loc3")).toBe("/model.0/conv/weight");
    expect(ops.locAliases.get("#loc4")).toBe("/model.0/conv/Conv");
    expect(ops.locAliases.get("#loc")).toBe("unknown");
  });
});

describe("computeLayout fan-out", () => {
  it("should spread fan-out nodes horizontally", () => {
    const src = `module {
  util.func public @test() {
    %0 = tensor.empty() : tensor<4x4xf32>
    %1 = linalg.fill ins(%0 : tensor<4x4xf32>) outs(%0 : tensor<4x4xf32>) -> tensor<4x4xf32>
    %2 = linalg.fill ins(%0 : tensor<4x4xf32>) outs(%0 : tensor<4x4xf32>) -> tensor<4x4xf32>
    %3 = linalg.fill ins(%0 : tensor<4x4xf32>) outs(%0 : tensor<4x4xf32>) -> tensor<4x4xf32>
    util.return
  }
}`;
    const ops = parseMLIR(src);
    const graph = buildGraph(ops);
    const layout = computeLayout(ops, graph);

    // The three fill ops should be in the same layer with distinct x positions
    const fills = layout.nodes.filter((n) => n.node.opName === "linalg.fill");
    expect(fills.length).toBe(3);
    const xs = fills.map((n) => n.x).sort((a, b) => a - b);
    expect(xs[1]).toBeGreaterThan(xs[0]);
    expect(xs[2]).toBeGreaterThan(xs[1]);
  });
});

describe("computeLayout ALAP sinking", () => {
  it("should place constants near their consumers, not at the top", () => {
    // constant feeds the generic via ins(), but the generic is deep
    // in the graph due to the fill chain. ALAP should push the constant
    // down to sit just above the generic.
    const src = `module {
  util.func public @test() {
    %cst = arith.constant 0.099999994 : f32
    %arg0 = tensor.empty() : tensor<4x4xf32>
    %0 = linalg.fill ins(%arg0 : tensor<4x4xf32>) outs(%arg0 : tensor<4x4xf32>) -> tensor<4x4xf32>
    %1 = linalg.fill ins(%0 : tensor<4x4xf32>) outs(%arg0 : tensor<4x4xf32>) -> tensor<4x4xf32>
    %2 = linalg.fill ins(%1 : tensor<4x4xf32>) outs(%arg0 : tensor<4x4xf32>) -> tensor<4x4xf32>
    %3 = linalg.generic {indexing_maps = [affine_map<(d0, d1) -> ()>, affine_map<(d0, d1) -> (d0, d1)>, affine_map<(d0, d1) -> (d0, d1)>], iterator_types = ["parallel", "parallel"]} ins(%cst, %2 : f32, tensor<4x4xf32>) outs(%arg0 : tensor<4x4xf32>) {
    ^bb0(%in: f32, %in_1: f32, %out: f32):
      %x = arith.mulf %in, %in_1 : f32
      linalg.yield %x : f32
    } -> tensor<4x4xf32>
    util.return
  }
}`;
    const ops = parseMLIR(src);
    const graph = buildGraph(ops);
    const layout = computeLayout(ops, graph);

    const constNode = layout.nodes.find((n) => n.node.opName === "arith.constant");
    const genericNode = layout.nodes.find((n) => n.node.opName === "linalg.generic");

    // The constant should be exactly 1 layer above the generic (its consumer),
    // not stuck at layer 0 far from where it's used.
    expect(constNode).toBeDefined();
    expect(genericNode).toBeDefined();
    expect(genericNode.layer - constNode.layer).toBe(1);
    // The generic is deep in the graph (layer 3+), so the constant should be too
    expect(constNode.layer).toBeGreaterThanOrEqual(2);
  });
});

describe("computeLayout loc group boxes (global-optimization fixture)", () => {
  const src = readFileSync(
    new URL("./fixtures/global-optimization.mlir", import.meta.url),
    "utf-8"
  );

  it("should produce loc group boxes with valid dimensions (showAux=false)", () => {
    const ops = parseMLIR(src);
    const graph = buildGraph(ops);
    const layout = computeLayout(ops, graph, false, true);

    expect(layout.locGroups).not.toBeNull();
    expect(layout.locGroups.length).toBeGreaterThan(0);

    for (const g of layout.locGroups) {
      expect(g.w).toBeGreaterThan(0);
      expect(g.h).toBeGreaterThan(0);
      expect(g.count).toBeGreaterThan(0);
    }
  });

  it("should produce loc group boxes with valid dimensions (showAux=true)", () => {
    const ops = parseMLIR(src);
    const graph = buildGraph(ops);
    const layout = computeLayout(ops, graph, true, true);

    expect(layout.locGroups).not.toBeNull();
    expect(layout.locGroups.length).toBeGreaterThan(0);

    for (const g of layout.locGroups) {
      expect(g.w).toBeGreaterThan(0);
      expect(g.h).toBeGreaterThan(0);
      expect(g.count).toBeGreaterThan(0);
    }
  });

  it("should have all nodes contained within their loc group boxes", () => {
    const ops = parseMLIR(src);
    const graph = buildGraph(ops);
    const layout = computeLayout(ops, graph, true, true);

    expect(layout.locGroups).not.toBeNull();

    // Build a map of loc -> box for leaf-level (depth 2) groups
    const leafBoxes = {};
    for (const g of layout.locGroups) {
      leafBoxes[g.loc] = g;
    }

    // Every node with a loc should be inside its corresponding box
    for (const node of layout.nodes) {
      const loc = node.node.loc;
      if (!loc) continue;

      // Find the most specific box that should contain this node
      const box = leafBoxes[loc];
      if (!box) continue;

      const inside =
        node.x >= box.x &&
        node.x + node.w <= box.x + box.w &&
        node.y >= box.y &&
        node.y + node.h <= box.y + box.h;

      if (!inside) {
        console.log(`Node ${node.node.opName} (${loc}) outside box:`,
          { node: { x: node.x, y: node.y, w: node.w, h: node.h }, box: { x: box.x, y: box.y, w: box.w, h: box.h } });
      }
      expect(inside).toBe(true);
    }
  });
});

// The flat-traced fixture is a large local-only dump, not committed to the
// repo — these tests run only when it exists on disk.
const FLAT_TRACED_URL = new URL("./fixtures/flat-traced.mlir", import.meta.url);

describe.skipIf(!existsSync(FLAT_TRACED_URL))(
  "computeLayout loc group boxes (flat-traced fixture)",
  () => {
  const src = () => readFileSync(FLAT_TRACED_URL, "utf-8");

  it("should produce flat loc group boxes with valid dimensions (showAux=false)", () => {
    const ops = parseMLIR(src());
    const graph = buildGraph(ops);
    const layout = computeLayout(ops, graph, false, true);

    expect(layout.locGroups).not.toBeNull();
    expect(layout.locGroups.length).toBeGreaterThan(0);

    for (const g of layout.locGroups) {
      expect(g.w).toBeGreaterThan(0);
      expect(g.h).toBeGreaterThan(0);
      expect(g.count).toBeGreaterThan(0);
    }
  });

  it("should produce flat loc group boxes with valid dimensions (showAux=true)", () => {
    const ops = parseMLIR(src());
    const graph = buildGraph(ops);
    const layout = computeLayout(ops, graph, true, true);

    expect(layout.locGroups).not.toBeNull();
    expect(layout.locGroups.length).toBeGreaterThan(0);

    for (const g of layout.locGroups) {
      expect(g.w).toBeGreaterThan(0);
      expect(g.h).toBeGreaterThan(0);
      expect(g.count).toBeGreaterThan(0);
    }
  });
  }
);

describe("inferGenericPurpose", () => {
  it("should classify generics in a real MLIR file", () => {
    const src = readFileSync(
      new URL("./fixtures/yolo-backbone.mlir", import.meta.url),
      "utf-8"
    );
    const ops = parseMLIR(src);
    const generics = ops.filter((o) => o.opName === "linalg.generic");

    expect(generics.length).toBeGreaterThan(0);

    // All should produce a label and color
    for (const g of generics) {
      const info = inferGenericPurpose(g);
      expect(info.label).toBeDefined();
      expect(info.icon).toBeDefined();
      expect(info.color).toBeDefined();
    }

    // Should find at least some leaky ReLU and bias add
    const labels = generics.map((g) => inferGenericPurpose(g).label);
    expect(labels).toContain("leaky ReLU");
    expect(labels).toContain("bias add");
    expect(labels).toContain("elem mul");
  });
});
