import { describe, it, expect } from "vitest";
import { parseMLIR } from "../src/parser/mlir-parser.js";
import { buildGraph } from "../src/graph/build-graph.js";
import { computeLayout } from "../src/graph/layout.js";
import { getLocColor } from "../src/utils/theme.js";

// ── Fixtures ──────────────────────────────────────────────────────────

/** Simple ops with loc on the same line. */
const INLINE_LOC = `#loc1 = loc("/model.0/conv/Conv")
#loc2 = loc("/model.0/conv/weight")
#loc3 = loc("/model.1/bn/BatchNorm")
#loc = loc(unknown)
module {
  func.func @main() {
    %0 = arith.constant dense<1.0> : tensor<3xf32> loc(#loc1)
    %1 = arith.constant dense<2.0> : tensor<3xf32> loc(#loc2)
    %2 = arith.constant dense<3.0> : tensor<3xf32> loc(#loc3)
    %3 = arith.constant dense<4.0> : tensor<3xf32> loc(#loc)
    %4 = arith.constant dense<5.0> : tensor<3xf32>
    util.return
  }
}`;

/** linalg.generic with loc on the closing brace line. */
const GENERIC_CLOSING_LOC = `#loc10 = loc("/model.5/conv/Conv")
#loc11 = loc("/model.5/act/Sigmoid")
module {
  func.func @main() {
    %arg0 = tensor.empty() : tensor<4xf32>
    %arg1 = tensor.empty() : tensor<4xf32>
    %0 = linalg.generic {indexing_maps = [affine_map<(d0) -> (d0)>, affine_map<(d0) -> (d0)>], iterator_types = ["parallel"]} ins(%arg0 : tensor<4xf32>) outs(%arg1 : tensor<4xf32>) {
    ^bb0(%in: f32, %out: f32):
      %1 = arith.addf %in, %out : f32
      linalg.yield %1 : f32
    } -> tensor<4xf32> loc(#loc10)
    util.return
  }
}`;

/** tensor.pad with loc on the closing brace line. */
const PAD_CLOSING_LOC = `#loc20 = loc("/model.0/conv/Conv")
module {
  func.func @main() {
    %cst = arith.constant 0.0 : f32
    %arg0 = tensor.empty() : tensor<3x640x640xf32>
    %padded = tensor.pad %arg0 low[0, 1, 1] high[0, 1, 1] {
    ^bb0(%a: index, %b: index, %c: index):
      tensor.yield %cst : f32
    } : tensor<3x640x640xf32> to tensor<3x642x642xf32> loc(#loc20)
    util.return
  }
}`;

/** Multiple ops sharing the same loc — for grouping tests.
 *  Uses dataflow edges so computeLayout doesn't early-return. */
const GROUPED_LOCS = `#loc30 = loc("/model.4/conv/Conv")
#loc31 = loc("/model.4/bn/BatchNorm")
#loc32 = loc("/model.5/conv/Conv")
module {
  func.func @main() {
    %0 = tensor.empty() : tensor<4x4xf32> loc(#loc30)
    %1 = linalg.fill ins(%0 : tensor<4x4xf32>) outs(%0 : tensor<4x4xf32>) -> tensor<4x4xf32> loc(#loc30)
    %2 = linalg.fill ins(%1 : tensor<4x4xf32>) outs(%0 : tensor<4x4xf32>) -> tensor<4x4xf32> loc(#loc31)
    %3 = linalg.fill ins(%2 : tensor<4x4xf32>) outs(%0 : tensor<4x4xf32>) -> tensor<4x4xf32> loc(#loc32)
    %4 = linalg.fill ins(%3 : tensor<4x4xf32>) outs(%0 : tensor<4x4xf32>) -> tensor<4x4xf32> loc(#loc32)
    %5 = linalg.fill ins(%4 : tensor<4x4xf32>) outs(%0 : tensor<4x4xf32>) -> tensor<4x4xf32> loc(#loc32)
    util.return
  }
}`;

/** Hierarchical loc paths for nested grouping — with dataflow edges. */
const HIERARCHICAL_LOCS = `#loc40 = loc("/model.4/m.0/cv1/conv/Conv")
#loc41 = loc("/model.4/m.0/cv2/conv/Conv")
#loc42 = loc("/model.4/m.1/cv1/conv/Conv")
#loc43 = loc("/model.5/cv1/conv/Conv")
module {
  func.func @main() {
    %0 = tensor.empty() : tensor<4x4xf32> loc(#loc40)
    %1 = linalg.fill ins(%0 : tensor<4x4xf32>) outs(%0 : tensor<4x4xf32>) -> tensor<4x4xf32> loc(#loc41)
    %2 = linalg.fill ins(%1 : tensor<4x4xf32>) outs(%0 : tensor<4x4xf32>) -> tensor<4x4xf32> loc(#loc42)
    %3 = linalg.fill ins(%2 : tensor<4x4xf32>) outs(%0 : tensor<4x4xf32>) -> tensor<4x4xf32> loc(#loc43)
    util.return
  }
}`;

/** Op with inline loc on opening line AND closing brace loc — opening wins. */
const INLINE_OVER_CLOSING = `#loc50 = loc("/model.6/conv/Conv")
#loc51 = loc("/model.7/act/ReLU")
module {
  func.func @main() {
    %arg0 = tensor.empty() : tensor<4xf32>
    %arg1 = tensor.empty() : tensor<4xf32>
    %0 = linalg.generic {indexing_maps = [affine_map<(d0) -> (d0)>, affine_map<(d0) -> (d0)>], iterator_types = ["parallel"]} ins(%arg0 : tensor<4xf32>) outs(%arg1 : tensor<4xf32>) {
    ^bb0(%in: f32, %out: f32):
      linalg.yield %in : f32
    } -> tensor<4xf32> loc(#loc51)
    util.return
  }
}`;

/** Dot-separated weight names (not hierarchical paths). */
const DOT_LOCS = `#loc60 = loc("model.0.conv.weight")
#loc61 = loc("model.0.conv.bias")
module {
  func.func @main() {
    %0 = arith.constant dense<1.0> : tensor<3xf32> loc(#loc60)
    %1 = arith.constant dense<2.0> : tensor<3xf32> loc(#loc61)
    util.return
  }
}`;

/** Direct inline loc("name") without alias definitions — simple op names. */
const DIRECT_INLINE_LOC = `module {
  func.func @main() {
    %0 = tensor.empty() : tensor<1x64x42x42xf32>
    %1 = tensor.empty() : tensor<1x64x40x40xf32>
    %2 = linalg.fill ins(%0 : tensor<1x64x42x42xf32>) outs(%0 : tensor<1x64x42x42xf32>) -> tensor<1x64x42x42xf32> loc("Conv_56")
    %3 = linalg.fill ins(%2 : tensor<1x64x42x42xf32>) outs(%1 : tensor<1x64x40x40xf32>) -> tensor<1x64x40x40xf32> loc("Sigmoid_57")
    util.return
  }
}`;

/** Direct inline loc on linalg.generic closing brace. */
const DIRECT_GENERIC_CLOSING_LOC = `module {
  func.func @main() {
    %arg0 = tensor.empty() : tensor<4xf32>
    %arg1 = tensor.empty() : tensor<4xf32>
    %0 = linalg.generic {indexing_maps = [affine_map<(d0) -> (d0)>, affine_map<(d0) -> (d0)>], iterator_types = ["parallel"]} ins(%arg0 : tensor<4xf32>) outs(%arg1 : tensor<4xf32>) {
    ^bb0(%in: f32, %out: f32):
      %1 = arith.addf %in, %out : f32
      linalg.yield %1 : f32
    } -> tensor<4xf32> loc("Sigmoid_57")
    util.return
  }
}`;

/** Direct inline loc on tensor.pad closing brace. */
const DIRECT_PAD_CLOSING_LOC = `module {
  func.func @main() {
    %cst = arith.constant 0.0 : f32
    %arg0 = tensor.empty() : tensor<3x640x640xf32>
    %padded = tensor.pad %arg0 low[0, 1, 1] high[0, 1, 1] {
    ^bb0(%a: index, %b: index, %c: index):
      tensor.yield %cst : f32
    } : tensor<3x640x640xf32> to tensor<3x642x642xf32> loc("Conv_56")
    util.return
  }
}`;

// ── Tests ─────────────────────────────────────────────────────────────

describe("loc parsing — inline loc on op line", () => {
  it("should extract loc and locPrefix from inline loc references", () => {
    const ops = parseMLIR(INLINE_LOC);
    const op0 = ops.find((o) => o.rawResults.includes("%0"));
    const op1 = ops.find((o) => o.rawResults.includes("%1"));
    const op2 = ops.find((o) => o.rawResults.includes("%2"));

    expect(op0.loc).toBe("/model.0/conv/Conv");
    expect(op0.locPrefix).toBe("/model.0");
    expect(op1.loc).toBe("/model.0/conv/weight");
    expect(op1.locPrefix).toBe("/model.0");
    expect(op2.loc).toBe("/model.1/bn/BatchNorm");
    expect(op2.locPrefix).toBe("/model.1");
  });

  it("should skip unknown loc references", () => {
    const ops = parseMLIR(INLINE_LOC);
    const op3 = ops.find((o) => o.rawResults.includes("%3"));
    expect(op3.loc).toBeNull();
    expect(op3.locPrefix).toBeNull();
  });

  it("should leave loc null when no loc annotation present", () => {
    const ops = parseMLIR(INLINE_LOC);
    const op4 = ops.find((o) => o.rawResults.includes("%4"));
    expect(op4.loc).toBeNull();
    expect(op4.locPrefix).toBeNull();
  });
});

describe("loc parsing — closing brace loc", () => {
  it("should extract loc from linalg.generic closing line", () => {
    const ops = parseMLIR(GENERIC_CLOSING_LOC);
    const generic = ops.find((o) => o.opName === "linalg.generic");
    expect(generic).toBeDefined();
    expect(generic.loc).toBe("/model.5/conv/Conv");
    expect(generic.locPrefix).toBe("/model.5");
  });

  it("should extract loc from tensor.pad closing line", () => {
    const ops = parseMLIR(PAD_CLOSING_LOC);
    const padOp = ops.find((o) => o.opName === "tensor.pad");
    expect(padOp).toBeDefined();
    expect(padOp.loc).toBe("/model.0/conv/Conv");
    expect(padOp.locPrefix).toBe("/model.0");
  });

  it("should not overwrite inline loc with closing loc", () => {
    const ops = parseMLIR(INLINE_OVER_CLOSING);
    const generic = ops.find((o) => o.opName === "linalg.generic");
    expect(generic).toBeDefined();
    // The generic has no inline loc, so closing loc should be used
    expect(generic.loc).toBe("/model.7/act/ReLU");
  });
});

describe("loc parsing — dot-separated names (non-hierarchical)", () => {
  it("should extract dot-separated loc paths", () => {
    const ops = parseMLIR(DOT_LOCS);
    const op0 = ops.find((o) => o.rawResults.includes("%0"));
    const op1 = ops.find((o) => o.rawResults.includes("%1"));
    expect(op0.loc).toBe("model.0.conv.weight");
    expect(op1.loc).toBe("model.0.conv.bias");
  });

  it("should not generate locPrefix for non-slash paths", () => {
    const ops = parseMLIR(DOT_LOCS);
    const op0 = ops.find((o) => o.rawResults.includes("%0"));
    // extractLocPrefix returns the path as-is if it doesn't start with "/"
    expect(op0.locPrefix).toBe("model.0.conv.weight");
  });
});

describe("loc parsing — direct inline loc(\"name\")", () => {
  it("should extract loc from direct inline loc strings on simple ops", () => {
    const ops = parseMLIR(DIRECT_INLINE_LOC);
    const op2 = ops.find((o) => o.rawResults.includes("%2"));
    const op3 = ops.find((o) => o.rawResults.includes("%3"));

    expect(op2.loc).toBe("Conv_56");
    expect(op2.locPrefix).toBe("Conv_56");
    expect(op3.loc).toBe("Sigmoid_57");
    expect(op3.locPrefix).toBe("Sigmoid_57");
  });

  it("should leave loc null for ops without loc annotation", () => {
    const ops = parseMLIR(DIRECT_INLINE_LOC);
    const op0 = ops.find((o) => o.rawResults.includes("%0"));
    expect(op0.loc).toBeNull();
  });

  it("should extract direct loc from linalg.generic closing brace", () => {
    const ops = parseMLIR(DIRECT_GENERIC_CLOSING_LOC);
    const generic = ops.find((o) => o.opName === "linalg.generic");
    expect(generic).toBeDefined();
    expect(generic.loc).toBe("Sigmoid_57");
  });

  it("should extract direct loc from tensor.pad closing brace", () => {
    const ops = parseMLIR(DIRECT_PAD_CLOSING_LOC);
    const padOp = ops.find((o) => o.opName === "tensor.pad");
    expect(padOp).toBeDefined();
    expect(padOp.loc).toBe("Conv_56");
  });
});

describe("locAliases map", () => {
  it("should build the full alias map from #loc definitions", () => {
    const ops = parseMLIR(INLINE_LOC);
    expect(ops.locAliases).toBeInstanceOf(Map);
    expect(ops.locAliases.get("#loc1")).toBe("/model.0/conv/Conv");
    expect(ops.locAliases.get("#loc2")).toBe("/model.0/conv/weight");
    expect(ops.locAliases.get("#loc3")).toBe("/model.1/bn/BatchNorm");
    expect(ops.locAliases.get("#loc")).toBe("unknown");
  });

  it("should include aliases from closing-loc fixtures too", () => {
    const ops = parseMLIR(GENERIC_CLOSING_LOC);
    expect(ops.locAliases.get("#loc10")).toBe("/model.5/conv/Conv");
    expect(ops.locAliases.get("#loc11")).toBe("/model.5/act/Sigmoid");
  });
});

describe("getLocColor", () => {
  it("should return consistent colors for the same string", () => {
    const c1 = getLocColor("/model.4");
    const c2 = getLocColor("/model.4");
    expect(c1).toBe(c2);
  });

  it("should return different colors for different strings", () => {
    const colors = new Set();
    for (let i = 0; i < 12; i++) {
      colors.add(getLocColor(`/model.${i}`));
    }
    // Should have at least a few distinct colors (hash collisions possible)
    expect(colors.size).toBeGreaterThanOrEqual(4);
  });

  it("should return a valid hex color string", () => {
    const c = getLocColor("/model.0/conv/Conv");
    expect(c).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

describe("computeLayout with locGrouping", () => {
  it("should produce locGroups when locGrouping=true", () => {
    const ops = parseMLIR(GROUPED_LOCS);
    const graph = buildGraph(ops);
    const layout = computeLayout(ops, graph, true, true);

    expect(layout.locGroups).toBeDefined();
    expect(layout.locGroups).not.toBeNull();
    expect(layout.locGroups.length).toBeGreaterThan(0);
  });

  it("should not produce locGroups when locGrouping=false", () => {
    const ops = parseMLIR(GROUPED_LOCS);
    const graph = buildGraph(ops);
    const layout = computeLayout(ops, graph, true, false);

    expect(layout.locGroups == null).toBe(true);
  });

  it("should create depth-0 boxes for top-level model groups", () => {
    const ops = parseMLIR(GROUPED_LOCS);
    const graph = buildGraph(ops);
    const layout = computeLayout(ops, graph, true, true);

    const depth0 = layout.locGroups.filter((g) => g.depth === 0);
    const locs = depth0.map((g) => g.loc).sort();
    expect(locs).toContain("/model.4");
    expect(locs).toContain("/model.5");
  });

  it("should create depth-2 leaf boxes for full loc paths", () => {
    const ops = parseMLIR(GROUPED_LOCS);
    const graph = buildGraph(ops);
    const layout = computeLayout(ops, graph, true, true);

    const depth2 = layout.locGroups.filter((g) => g.depth === 2);
    const locs = depth2.map((g) => g.loc).sort();
    expect(locs).toContain("/model.4/conv/Conv");
    expect(locs).toContain("/model.5/conv/Conv");
  });

  it("should have valid bounding boxes with positive dimensions", () => {
    const ops = parseMLIR(GROUPED_LOCS);
    const graph = buildGraph(ops);
    const layout = computeLayout(ops, graph, true, true);

    for (const g of layout.locGroups) {
      expect(g.w).toBeGreaterThan(0);
      expect(g.h).toBeGreaterThan(0);
      expect(typeof g.x).toBe("number");
      expect(typeof g.y).toBe("number");
    }
  });

  it("should sort groups outermost first (depth ascending)", () => {
    const ops = parseMLIR(HIERARCHICAL_LOCS);
    const graph = buildGraph(ops);
    const layout = computeLayout(ops, graph, true, true);

    for (let i = 1; i < layout.locGroups.length; i++) {
      const prev = layout.locGroups[i - 1];
      const curr = layout.locGroups[i];
      if (prev.depth !== curr.depth) {
        expect(prev.depth).toBeLessThanOrEqual(curr.depth);
      }
    }
  });

  it("should create depth-1 boxes only when parent has multiple sub-groups", () => {
    const ops = parseMLIR(HIERARCHICAL_LOCS);
    const graph = buildGraph(ops);
    const layout = computeLayout(ops, graph, true, true);

    const depth1 = layout.locGroups.filter((g) => g.depth === 1);
    // /model.4 has sub-groups m.0 and m.1, so should have depth-1 boxes
    const model4Subs = depth1.filter((g) => g.loc.startsWith("/model.4/"));
    expect(model4Subs.length).toBeGreaterThanOrEqual(2);

    // /model.5 has only one sub-group (cv1), so should NOT have depth-1 boxes
    const model5Subs = depth1.filter((g) => g.loc.startsWith("/model.5/"));
    expect(model5Subs.length).toBe(0);
  });

  it("should create flat loc groups for non-slash-prefixed locs", () => {
    const ops = parseMLIR(DIRECT_INLINE_LOC);
    const graph = buildGraph(ops);
    const layout = computeLayout(ops, graph, true, true);

    // Flat loc names should produce depth-2 boxes
    if (layout.locGroups && layout.locGroups.length > 0) {
      const flatGroups = layout.locGroups.filter((g) => !g.loc.startsWith("/"));
      const locs = flatGroups.map((g) => g.loc).sort();
      expect(locs).toContain("Conv_56");
      expect(locs).toContain("Sigmoid_57");
      for (const g of flatGroups) {
        expect(g.depth).toBe(2);
      }
    }
  });
});

describe("computeLayout loc clustering", () => {
  it("should cluster same-loc nodes closer together in barycenter sort", () => {
    // With locGrouping on, nodes sharing a loc should be adjacent
    const ops = parseMLIR(GROUPED_LOCS);
    const graph = buildGraph(ops);
    const layout = computeLayout(ops, graph, true, true);

    // Nodes with loc "/model.5/conv/Conv" should have consecutive x positions
    const model5Nodes = layout.nodes.filter(
      (n) => n.node.loc === "/model.5/conv/Conv"
    );
    if (model5Nodes.length >= 2) {
      const xs = model5Nodes.map((n) => n.x).sort((a, b) => a - b);
      // Check they're not wildly spread — gap should be reasonable
      const maxGap = xs[xs.length - 1] - xs[0];
      expect(maxGap).toBeLessThan(layout.w);
    }
  });
});
