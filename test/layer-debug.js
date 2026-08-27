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

// Group nodes by layer
const byLayer = {};
for (const n of layout.nodes) {
  const l = n.layer;
  if (!byLayer[l]) byLayer[l] = [];
  byLayer[l].push(n);
}

// For each layer, show node count and x-range
const layers = Object.keys(byLayer).map(Number).sort((a, b) => a - b);
console.log("Layer | Nodes | MinX | MaxX | Width | Node names (first 3)");
console.log("------|-------|------|------|-------|-----");
for (const l of layers) {
  const nodes = byLayer[l].sort((a, b) => a.x - b.x);
  const minX = Math.round(nodes[0].x);
  const maxX = Math.round(nodes[nodes.length - 1].x + nodes[nodes.length - 1].w);
  const width = maxX - minX;
  const names = nodes.slice(0, 3).map(n => n.node?.opName || '?').join(', ');
  console.log(`${String(l).padStart(5)} | ${String(nodes.length).padStart(5)} | ${String(minX).padStart(4)} | ${String(maxX).padStart(4)} | ${String(width).padStart(5)} | ${names}`);
}

// Edge crossing analysis - how many edges cross at each y level
console.log("\n--- Edge Analysis ---");
console.log(`Total edges: ${layout.edges.length}`);

// Count edges that have >2 points (long edges with waypoints)
const longEdges = layout.edges.filter(e => e.points.length > 2);
console.log(`Long edges (with waypoints): ${longEdges.length}`);

// Measure horizontal spread of edges at various y levels
const yLevels = [500, 2000, 5000, 10000, 15000, 20000];
for (const y of yLevels) {
  // Find edges that cross this y level
  const crossingXs = [];
  for (const e of layout.edges) {
    const pts = e.points;
    for (let i = 0; i < pts.length - 1; i++) {
      if ((pts[i].y <= y && pts[i + 1].y >= y) || (pts[i].y >= y && pts[i + 1].y <= y)) {
        const t = (y - pts[i].y) / (pts[i + 1].y - pts[i].y);
        const x = pts[i].x + t * (pts[i + 1].x - pts[i].x);
        crossingXs.push(Math.round(x));
        break;
      }
    }
  }
  if (crossingXs.length > 0) {
    crossingXs.sort((a, b) => a - b);
    const minX = crossingXs[0];
    const maxX = crossingXs[crossingXs.length - 1];
    // Count edges within 10px of each other
    let overlaps = 0;
    for (let i = 1; i < crossingXs.length; i++) {
      if (crossingXs[i] - crossingXs[i - 1] < 3) overlaps++;
    }
    console.log(`y=${y}: ${crossingXs.length} edges crossing, span ${maxX - minX}px, ${overlaps} overlapping (<3px apart)`);
  }
}
