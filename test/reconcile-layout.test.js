import { describe, it, expect } from "vitest";
import { parseMLIR } from "../src/parser/mlir-parser.js";
import { buildGraph, getHighlightedNodeSets } from "../src/graph/build-graph.js";
import { computeLayout } from "../src/graph/layout.js";
import { reconcileLayout } from "../src/graph/reconcile-layout.js";

// A chain long enough that growing the selection changes the layered layout
const CHAIN = `module {
  util.func public @chain() {
    %0 = tensor.empty() : tensor<4xf32>
    %1 = math.absf %0 : tensor<4xf32>
    %2 = math.sqrt %1 : tensor<4xf32>
    %3 = math.exp %2 : tensor<4xf32>
    %4 = math.log %3 : tensor<4xf32>
    %5 = math.sin %4 : tensor<4xf32>
    %6 = math.cos %5 : tensor<4xf32>
    util.return
  }
}`;

// SSA names are scope-qualified by the parser (e.g. "%2@1") — resolve the
// highlighted values from the defining ops' names instead of hardcoding.
function valOf(ops, opName) {
  return ops.find((o) => o.opName === opName).results[0];
}

function subgraphLayout(ops, graph, hiVals) {
  const { primary, related } = getHighlightedNodeSets(hiVals, graph);
  const subOps = ops.filter((o) => primary.has(o.id) || related.has(o.id));
  return computeLayout(subOps, graph, true, false);
}

function posMap(layout) {
  return new Map(layout.nodes.map((p) => [p.node.id, { x: p.x, y: p.y }]));
}

describe("reconcileLayout", () => {
  const ops = parseMLIR(CHAIN);
  const graph = buildGraph(ops);

  it("returns the fresh layout when there are no previous positions", () => {
    const fresh = subgraphLayout(ops, graph, [valOf(ops, "math.sqrt")]);
    expect(reconcileLayout(fresh, null)).toBe(fresh);
  });

  it("pins surviving nodes at their previous positions when growing", () => {
    const first = subgraphLayout(ops, graph, [valOf(ops, "math.sqrt")]);
    const prev = posMap(first);

    const grown = subgraphLayout(ops, graph, [valOf(ops, "math.sqrt"), valOf(ops, "math.log")]);
    const reconciled = reconcileLayout(grown, prev);

    for (const p of reconciled.nodes) {
      const old = prev.get(p.node.id);
      if (old) {
        expect(p.x).toBe(old.x);
        expect(p.y).toBe(old.y);
      }
    }
    // The grown subgraph must actually contain new nodes for this to be meaningful
    expect(reconciled.nodes.length).toBeGreaterThan(first.nodes.length);
  });

  it("pins all remaining nodes when shrinking", () => {
    const big = subgraphLayout(ops, graph, [valOf(ops, "math.sqrt"), valOf(ops, "math.log")]);
    const prev = posMap(big);

    const shrunk = subgraphLayout(ops, graph, [valOf(ops, "math.sqrt")]);
    const reconciled = reconcileLayout(shrunk, prev);

    for (const p of reconciled.nodes) {
      const old = prev.get(p.node.id);
      expect(old).toBeDefined();
      expect(p.x).toBe(old.x);
      expect(p.y).toBe(old.y);
    }
  });

  it("places new nodes without overlapping existing ones", () => {
    const first = subgraphLayout(ops, graph, [valOf(ops, "math.sqrt")]);
    const grown = subgraphLayout(ops, graph, [valOf(ops, "math.sqrt"), valOf(ops, "math.sin")]);
    const reconciled = reconcileLayout(grown, posMap(first));

    const nodes = reconciled.nodes;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        const separate =
          a.x + a.w <= b.x || b.x + b.w <= a.x ||
          a.y + a.h <= b.y || b.y + b.h <= a.y;
        expect(separate, `${a.node.opName} overlaps ${b.node.opName}`).toBe(true);
      }
    }
  });

  it("rebuilds edges anchored to final node positions", () => {
    const first = subgraphLayout(ops, graph, [valOf(ops, "math.sqrt")]);
    const grown = subgraphLayout(ops, graph, [valOf(ops, "math.sqrt"), valOf(ops, "math.log")]);
    const reconciled = reconcileLayout(grown, posMap(first));

    const byId = new Map(reconciled.nodes.map((p) => [p.node.id, p]));
    expect(reconciled.edges.length).toBeGreaterThan(0);
    for (const e of reconciled.edges) {
      const fp = byId.get(e.from);
      const tp = byId.get(e.to);
      expect(e.points.length).toBe(2);
      // Source port on the bottom edge of the source node
      expect(e.points[0].y).toBe(fp.y + fp.h);
      expect(e.points[0].x).toBeGreaterThanOrEqual(fp.x);
      expect(e.points[0].x).toBeLessThanOrEqual(fp.x + fp.w);
      // Target port on the top edge of the target node
      expect(e.points[1].y).toBe(tp.y);
      expect(e.points[1].x).toBeGreaterThanOrEqual(tp.x);
      expect(e.points[1].x).toBeLessThanOrEqual(tp.x + tp.w);
    }
  });

  it("reports a bounding box covering all pinned and new nodes", () => {
    const first = subgraphLayout(ops, graph, [valOf(ops, "math.sqrt")]);
    const grown = subgraphLayout(ops, graph, [valOf(ops, "math.sqrt"), valOf(ops, "math.sin")]);
    const reconciled = reconcileLayout(grown, posMap(first));

    for (const p of reconciled.nodes) {
      expect(p.x).toBeGreaterThanOrEqual(reconciled.x0);
      expect(p.y).toBeGreaterThanOrEqual(reconciled.y0);
      expect(p.x + p.w).toBeLessThanOrEqual(reconciled.x0 + reconciled.w);
      expect(p.y + p.h).toBeLessThanOrEqual(reconciled.y0 + reconciled.h);
    }
  });

  it("is idempotent — reconciling against its own output changes nothing", () => {
    const first = subgraphLayout(ops, graph, [valOf(ops, "math.sqrt")]);
    const grown = subgraphLayout(ops, graph, [valOf(ops, "math.sqrt"), valOf(ops, "math.log")]);
    const once = reconcileLayout(grown, posMap(first));
    const twice = reconcileLayout(grown, posMap(once));
    for (const p of twice.nodes) {
      const old = posMap(once).get(p.node.id);
      expect(p.x).toBe(old.x);
      expect(p.y).toBe(old.y);
    }
  });
});
