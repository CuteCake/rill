import { readFileSync } from "fs";
import { parseMLIR } from "../src/parser/mlir-parser.js";
import { buildGraph } from "../src/graph/build-graph.js";
import { computeLayout, LAYOUT } from "../src/graph/layout.js";
import { inferGenericPurpose } from "../src/parser/infer-generic.js";

// Peek inside computeLayout to count dummies per layer
const src = readFileSync("test/fixtures/yolo-backbone.mlir", "utf-8");
const ops = parseMLIR(src);
try { inferGenericPurpose(ops); } catch (e) {}
const graph = buildGraph(ops);

// Manually run the first steps to count dummies
const { NODE_W: NW, DUMMY_W: DW } = LAYOUT;

// Count edges by span
const layout = computeLayout(ops, graph, true, false);
console.log(`Nodes: ${layout.nodes.length}, Edges: ${layout.edges.length}`);
console.log(`Graph width: ${layout.w}px`);

// Count edges by layerDist
const byDist = {};
for (const e of layout.edges) {
  const d = e.layerDist || 1;
  byDist[d] = (byDist[d] || 0) + 1;
}
console.log("\nEdge layer spans:");
for (const [d, c] of Object.entries(byDist).sort((a,b) => +a[0] - +b[0])) {
  console.log(`  span ${d}: ${c} edges`);
}

// Estimate: for a layer in the middle, how many dummy nodes pass through?
// Each edge with span > 1 creates (span-1) dummies, one per intermediate layer
// Total dummies = sum of (span-1) for all long edges
let totalDummies = 0;
for (const [d, c] of Object.entries(byDist)) {
  const span = +d;
  if (span > 1) totalDummies += (span - 1) * c;
}
console.log(`\nTotal dummy nodes: ${totalDummies}`);
console.log(`Avg per intermediate layer (rough): if dummies spread across ~${Math.round(layout.h / (LAYOUT.NODE_H + LAYOUT.GAP_Y))} layers`);
const numLayers = Math.round(layout.h / (LAYOUT.NODE_H + LAYOUT.GAP_Y));
console.log(`  ~${Math.round(totalDummies / numLayers)} dummies per layer`);
console.log(`  At 14px gap + 12px width = ${14 + DW}px per dummy`);
console.log(`  That's ${Math.round(totalDummies / numLayers) * (14 + DW)}px of dummy width per layer`);
console.log(`  vs ${NW}px node width`);
