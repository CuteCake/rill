import { readFileSync } from "fs";
import { parseMLIR } from "../src/parser/mlir-parser.js";
import { buildGraph } from "../src/graph/build-graph.js";
import { computeLayout } from "../src/graph/layout.js";
import { inferGenericPurpose } from "../src/parser/infer-generic.js";

const src = readFileSync("test/fixtures/global-optimization.mlir", "utf-8");
const ops = parseMLIR(src);
try { inferGenericPurpose(ops); } catch (e) {}
const graph = buildGraph(ops);
const layout = computeLayout(ops, graph, true, true); // aux on, loc grouping on

console.log(`Nodes: ${layout.nodes.length}, Edges: ${layout.edges.length}`);
console.log(`Graph size: ${layout.w}w x ${layout.h}h`);

// Check node-to-node overlap within layers
const byLayer = {};
for (const n of layout.nodes) {
  if (!byLayer[n.layer]) byLayer[n.layer] = [];
  byLayer[n.layer].push(n);
}
let nodeOverlaps = 0;
for (const [l, nodes] of Object.entries(byLayer)) {
  nodes.sort((a, b) => a.x - b.x);
  for (let i = 0; i < nodes.length - 1; i++) {
    const gap = nodes[i + 1].x - (nodes[i].x + nodes[i].w);
    if (gap < -1) {
      nodeOverlaps++;
    }
  }
}
console.log(`Node-to-node overlaps within layers: ${nodeOverlaps}`);

// Check loc group overlap
if (layout.locGroups) {
  let overlaps = 0;
  for (let i = 0; i < layout.locGroups.length; i++) {
    for (let j = i + 1; j < layout.locGroups.length; j++) {
      const a = layout.locGroups[i];
      const b = layout.locGroups[j];
      if (a.depth !== b.depth) continue;
      const hOverlap = a.x < b.x + b.w && a.x + a.w > b.x;
      const vOverlap = a.y < b.y + b.h && a.y + a.h > b.y;
      if (hOverlap && vOverlap) overlaps++;
    }
  }
  console.log(`Loc groups: ${layout.locGroups.length}, same-depth overlaps: ${overlaps}`);
}
