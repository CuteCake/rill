import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseMLIR } from "../src/parser/mlir-parser.js";
import { buildGraph } from "../src/graph/build-graph.js";
import { matchSnapshots } from "../src/pipeline/match.js";
import { pairDiffStats } from "../src/pipeline/step-context.js";
import {
  diffLines,
  tokenDiff,
  matchDiff,
  opTextBlock,
} from "../src/pipeline/text-diff.js";

const read = (name) =>
  readFileSync(new URL(`./fixtures/pipeline/${name}`, import.meta.url), "utf8");

function load(name) {
  const ops = parseMLIR(read(name));
  return { ops, graph: buildGraph(ops) };
}

describe("diffLines", () => {
  it("aligns identical sequences as all-same", () => {
    const d = diffLines(["a", "b"], ["a", "b"]);
    expect(d.map((e) => e.type)).toEqual(["same", "same"]);
  });

  it("detects insertions, deletions, and replacements", () => {
    const d = diffLines(["a", "b", "c"], ["a", "x", "c", "d"]);
    expect(d).toEqual([
      { type: "same", text: "a" },
      { type: "del", text: "b" },
      { type: "add", text: "x" },
      { type: "same", text: "c" },
      { type: "add", text: "d" },
    ]);
  });
});

describe("tokenDiff", () => {
  it("highlights the changed attribute token, not the whole line", () => {
    const { a, b } = tokenDiff(
      "%0 = linalg.fill {stride = 1} ins(%c : f32)",
      "%0 = linalg.fill {stride = 2} ins(%c : f32)"
    );
    const changedA = a.filter((s) => s.hl === "chg").map((s) => s.text.trim());
    const changedB = b.filter((s) => s.hl === "chg").map((s) => s.text.trim());
    expect(changedA).toEqual(["1"]);
    expect(changedB).toEqual(["2"]);
  });

  it("classifies pure SSA renames as 'ren', not 'chg'", () => {
    const { a, b } = tokenDiff(
      "%37 = arith.addf %35, %36 : f32",
      "%41 = arith.addf %39, %40 : f32"
    );
    expect(a.some((s) => s.hl === "chg")).toBe(false);
    expect(b.some((s) => s.hl === "chg")).toBe(false);
    expect(a.filter((s) => s.hl === "ren").length).toBeGreaterThan(0);
  });

  it("classifies #loc alias renumbering as 'ren'", () => {
    const { a } = tokenDiff("tensor.empty() loc(#loc12)", "tensor.empty() loc(#loc99)");
    expect(a.some((s) => s.hl === "chg")).toBe(false);
    expect(a.some((s) => s.hl === "ren")).toBe(true);
  });
});

describe("matchDiff on real matched ops", () => {
  const p1 = load("pass1.mlir");
  const p2 = load("pass2.mlir");
  const ms = matchSnapshots(p1.ops, p1.graph, p2.ops, p2.graph);

  it("shows the widened type as the changed token for a 'changed' match", () => {
    const a = p1.ops.find((o) => o.loc === "/m.2/Mul");
    const m = ms.fromIndex.get(a.id);
    expect(m.kind).toBe("changed");
    const rows = matchDiff(
      m.from.map((id) => p1.ops[id]),
      m.to.map((id) => p2.ops[id])
    );
    const del = rows.find((r) => r.type === "del");
    const add = rows.find((r) => r.type === "add");
    expect(del).toBeDefined();
    // Only the widened dimension token is marked changed (4 → 8)
    expect(add.spans.some((s) => s.hl === "chg" && s.text.includes("8"))).toBe(true);
    expect(del.spans.some((s) => s.hl === "chg" && s.text.includes("4"))).toBe(true);
    // The unchanged parts of the line stay unhighlighted
    expect(add.spans.some((s) => s.hl === null && s.text.includes("linalg.fill"))).toBe(true);
  });

  it("includes captured region bodies in the diffed block", () => {
    const generic = parseMLIR(`module {
  func.func @main() {
    %arg0 = tensor.empty() : tensor<4xf32>
    %0 = linalg.generic {iterator_types = ["parallel"]} ins(%arg0 : tensor<4xf32>) outs(%arg0 : tensor<4xf32>) {
    ^bb0(%in: f32, %out: f32):
      %1 = arith.addf %in, %out : f32
      linalg.yield %1 : f32
    } -> tensor<4xf32>
    util.return
  }
}`);
    const op = generic.find((o) => o.opName === "linalg.generic");
    expect(opTextBlock(op).some((l) => l.includes("arith.addf"))).toBe(true);
  });

  it("folds long unchanged runs into skip rows", () => {
    const a = Array.from({ length: 30 }, (_, i) => `line ${i}`);
    const b = [...a];
    b[15] = "line 15 CHANGED";
    const rows = matchDiff(
      [{ trimmed: "x", genericBody: a.slice(1) }],
      [{ trimmed: "x", genericBody: b.slice(1) }]
    );
    expect(rows.some((r) => r.type === "skip")).toBe(true);
    const kept = rows.filter((r) => r.type === "context").length;
    expect(kept).toBeLessThanOrEqual(5);
  });
});

describe("pairDiffStats", () => {
  it("reports hasDiff=false for identical snapshots", () => {
    const p1 = load("pass1.mlir");
    const p1b = load("pass1.mlir");
    const ms = matchSnapshots(p1.ops, p1.graph, p1b.ops, p1b.graph);
    const stats = pairDiffStats(ms, p1.ops, p1b.ops);
    expect(stats.hasDiff).toBe(false);
    expect(stats.added + stats.removed + stats.changed + stats.split + stats.merged).toBe(0);
  });

  it("reports full stats for a real pass and caches on the MatchSet", () => {
    const p1 = load("pass1.mlir");
    const p2 = load("pass2.mlir");
    const ms = matchSnapshots(p1.ops, p1.graph, p2.ops, p2.graph);
    const stats = pairDiffStats(ms, p1.ops, p2.ops);
    expect(stats.hasDiff).toBe(true);
    expect(stats.added).toBeGreaterThan(0);
    expect(stats.removed).toBeGreaterThan(0);
    expect(stats.changed).toBeGreaterThan(0);
    expect(stats.split).toBeGreaterThan(0);
    expect(stats.merged).toBeGreaterThan(0);
    expect(pairDiffStats(ms, p1.ops, p2.ops)).toBe(stats); // cached
  });
});

// ── Attribute-cap regression: changes past op.trimmed's 6-attr summary ──

import { parsePrototxt } from "../src/parser/prototxt.js";
import { applyImportMapping } from "../src/parser/import-map.js";
import { BUILTIN_CAFFE_PROFILE } from "../src/extensions/profiles/caffe.js";

const CAFFE_LAYER = (dilation) => `name: "net"
input: "data"
input_dim: 1
input_dim: 3
input_dim: 224
input_dim: 224
layer {
  name: "conv1"
  type: "Convolution"
  bottom: "data"
  top: "conv1"
  convolution_param {
    num_output: 64
    kernel_size: 7
    stride: 2
    pad: 3
    group: 1
    bias_term: true
    dilation: ${dilation}
  }
}`;

function importCaffe(src) {
  const { root, errors } = parsePrototxt(src);
  expect(errors).toEqual([]);
  const { ops } = applyImportMapping(root, BUILTIN_CAFFE_PROFILE.import);
  return { ops, graph: buildGraph(ops) };
}

describe("imported-format attrs beyond the summary cap", () => {
  it("exposes every attribute as paramLines on the op", () => {
    const { ops } = importCaffe(CAFFE_LAYER(1));
    const conv = ops.find((o) => o.attrs.name === "conv1");
    expect(conv.paramLines.some((l) => l.startsWith("dilation"))).toBe(true);
    // ...even though the display line is capped
    expect(conv.trimmed.includes("dilation")).toBe(false);
  });

  it("detects a change to the 7th attribute as 'changed', not 'same'", () => {
    const a = importCaffe(CAFFE_LAYER(1));
    const b = importCaffe(CAFFE_LAYER(2));
    const ms = matchSnapshots(a.ops, a.graph, b.ops, b.graph);
    const conv = a.ops.find((o) => o.attrs.name === "conv1");
    const m = ms.fromIndex.get(conv.id);
    expect(m.via).toBe("symbol");
    expect(m.kind).toBe("changed");
    const rows = matchDiff(
      m.from.map((id) => a.ops[id]),
      m.to.map((id) => b.ops[id])
    );
    const add = rows.find(
      (r) => r.type === "add" && r.spans.some((s) => s.text.includes("dilation"))
    );
    expect(add).toBeDefined();
    expect(add.spans.some((s) => s.hl === "chg" && s.text.includes("2"))).toBe(true);
  });
});

describe("MLIR region-body-only changes", () => {
  const GENERIC = (bodyOp) => `module {
  func.func @main() {
    %arg0 = tensor.empty() : tensor<4xf32>
    %0 = linalg.generic {indexing_maps = [affine_map<(d0) -> (d0)>, affine_map<(d0) -> (d0)>], iterator_types = ["parallel"]} ins(%arg0 : tensor<4xf32>) outs(%arg0 : tensor<4xf32>) {
    ^bb0(%in: f32, %out: f32):
      %1 = arith.${bodyOp} %in, %out : f32
      linalg.yield %1 : f32
    } -> tensor<4xf32> loc("/m.0/Act")
    util.return
  }
}`;

  it("flags a body-only rewrite as 'changed' even with an identical header", () => {
    const a = parseMLIR(GENERIC("addf"));
    const b = parseMLIR(GENERIC("mulf"));
    const ms = matchSnapshots(a, buildGraph(a), b, buildGraph(b));
    const g = a.find((o) => o.opName === "linalg.generic");
    const m = ms.fromIndex.get(g.id);
    expect(m.kind).toBe("changed");
    const rows = matchDiff([g], [b[m.to[0]]]);
    expect(
      rows.some((r) => r.type === "add" && r.spans.some((s) => s.hl === "chg" && s.text.includes("mulf")))
    ).toBe(true);
  });

  it("still reports identical generics as 'same'", () => {
    const a = parseMLIR(GENERIC("addf"));
    const b = parseMLIR(GENERIC("addf"));
    const ms = matchSnapshots(a, buildGraph(a), b, buildGraph(b));
    const g = a.find((o) => o.opName === "linalg.generic");
    expect(ms.fromIndex.get(g.id).kind).toBe("same");
  });
});
