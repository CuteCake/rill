/**
 * Layout quality stats — run with: node test/layout-stats.js
 * Reports metrics and an ASCII minimap of the layout.
 */
import { readFileSync } from "fs";
import { parseMLIR } from "../src/parser/mlir-parser.js";
import { buildGraph } from "../src/graph/build-graph.js";
import { computeLayout } from "../src/graph/layout.js";
import { inferGenericPurpose } from "../src/parser/infer-generic.js";

const fixtures = [
  "test/fixtures/yolo-backbone.mlir",
  "test/fixtures/global-optimization.mlir",
];

for (const file of fixtures) {
  const src = readFileSync(file, "utf-8");
  const ops = parseMLIR(src);
  try { inferGenericPurpose(ops); } catch (e) { /* skip */ }
  const graph = buildGraph(ops);
  const layout = computeLayout(ops, graph, true, false);

  // Edge straightness: for each edge, measure horizontal deviation
  let totalDeviation = 0;
  let maxDeviation = 0;
  let straightCount = 0;
  const deviations = [];

  for (const edge of layout.edges) {
    const pts = edge.points;
    if (pts.length < 2) continue;
    const startX = pts[0].x;
    const endX = pts[pts.length - 1].x;
    let edgeMaxDev = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      const t = (pts[i].y - pts[0].y) / (pts[pts.length - 1].y - pts[0].y);
      const expectedX = startX + (endX - startX) * t;
      const dev = Math.abs(pts[i].x - expectedX);
      edgeMaxDev = Math.max(edgeMaxDev, dev);
    }
    deviations.push(edgeMaxDev);
    totalDeviation += edgeMaxDev;
    maxDeviation = Math.max(maxDeviation, edgeMaxDev);
    if (edgeMaxDev < 5) straightCount++;
  }

  // Graph width
  const graphWidth = Math.max(...layout.nodes.map((n) => n.x + n.w)) - Math.min(...layout.nodes.map((n) => n.x));

  // Sort deviations to get percentiles
  deviations.sort((a, b) => a - b);
  const p50 = deviations[Math.floor(deviations.length * 0.5)] || 0;
  const p90 = deviations[Math.floor(deviations.length * 0.9)] || 0;
  const p99 = deviations[Math.floor(deviations.length * 0.99)] || 0;

  console.log(`\n=== ${file} ===`);
  console.log(`  Nodes: ${layout.nodes.length}, Edges: ${layout.edges.length}`);
  console.log(`  Graph size: ${Math.round(graphWidth)}w x ${layout.h}h`);
  console.log(`  Edge deviation (from straight line):`);
  console.log(`    Mean: ${(totalDeviation / deviations.length).toFixed(1)}px`);
  console.log(`    p50: ${p50.toFixed(1)}px, p90: ${p90.toFixed(1)}px, p99: ${p99.toFixed(1)}px`);
  console.log(`    Max: ${maxDeviation.toFixed(1)}px`);
  console.log(`    Straight (<5px): ${straightCount}/${deviations.length} (${(100 * straightCount / deviations.length).toFixed(0)}%)`);

  // ── ASCII minimap ──
  // Render nodes as [##] blocks and edges as lines on a character grid
  const COLS = 120;
  const ROWS = 80;
  const minX = Math.min(...layout.nodes.map((n) => n.x));
  const maxX = Math.max(...layout.nodes.map((n) => n.x + n.w));
  const minY = Math.min(...layout.nodes.map((n) => n.y));
  const maxY = Math.max(...layout.nodes.map((n) => n.y + n.h));
  const scaleX = (maxX - minX) > 0 ? (COLS - 1) / (maxX - minX) : 1;
  const scaleY = (maxY - minY) > 0 ? (ROWS - 1) / (maxY - minY) : 1;

  const grid = Array.from({ length: ROWS }, () => Array(COLS).fill(" "));

  function plot(x, y, ch) {
    const col = Math.round((x - minX) * scaleX);
    const row = Math.round((y - minY) * scaleY);
    if (row >= 0 && row < ROWS && col >= 0 && col < COLS) {
      grid[row][col] = ch;
    }
  }

  // Draw edges first (so nodes overwrite)
  for (const edge of layout.edges) {
    const pts = edge.points;
    for (let i = 0; i < pts.length - 1; i++) {
      const x0 = pts[i].x, y0 = pts[i].y;
      const x1 = pts[i + 1].x, y1 = pts[i + 1].y;
      const steps = Math.max(
        Math.abs(Math.round((x1 - x0) * scaleX)),
        Math.abs(Math.round((y1 - y0) * scaleY)),
        1
      );
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const ch = Math.abs(x1 - x0) > Math.abs(y1 - y0) * 0.3 ? "~" : "|";
        plot(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, ch);
      }
    }
  }

  // Draw nodes on top
  for (const n of layout.nodes) {
    const cx = n.x + n.w / 2;
    const cy = n.y + n.h / 2;
    plot(cx, cy, "#");
  }

  console.log("\n  ASCII minimap:");
  for (const row of grid) {
    const line = row.join("");
    if (line.trim()) console.log("  " + line);
  }
}
