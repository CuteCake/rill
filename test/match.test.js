import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { parseMLIR } from "../src/parser/mlir-parser.js";
import { buildGraph } from "../src/graph/build-graph.js";
import { matchSnapshots } from "../src/pipeline/match.js";
import { keysForOps, resolveKeys } from "../src/pipeline/node-key.js";

const read = (name) =>
  readFileSync(new URL(`./fixtures/pipeline/${name}`, import.meta.url), "utf8");

function load(name) {
  const ops = parseMLIR(read(name));
  return { ops, graph: buildGraph(ops) };
}

const byResult = (ops, r) => ops.find((o) => o.rawResults.includes(r));
const byLoc = (ops, loc) => ops.filter((o) => o.loc === loc);

describe("matchSnapshots — pass1 → pass2", () => {
  const p1 = load("pass1.mlir");
  const p2 = load("pass2.mlir");
  const ms = matchSnapshots(p1.ops, p1.graph, p2.ops, p2.graph);

  it("matches an untouched op as 1:1 same via loc", () => {
    const a = byResult(p1.ops, "%2"); // loc /m.1/Add
    const m = ms.fromIndex.get(a.id);
    expect(m).toBeDefined();
    expect(m.kind).toBe("same");
    expect(m.via).toBe("loc");
    expect(m.to).toHaveLength(1);
    expect(p2.ops[m.to[0]].loc).toBe("/m.1/Add");
  });

  it("detects attribute/type-only rewrites as changed", () => {
    const a = byResult(p1.ops, "%3"); // loc /m.2/Mul, type widened in pass2
    const m = ms.fromIndex.get(a.id);
    expect(m.kind).toBe("changed");
    expect(m.confidence).toBeGreaterThanOrEqual(0.85);
  });

  it("detects 1→3 split when a leaf loc fans out", () => {
    const a = byResult(p1.ops, "%1"); // loc /m.0/Conv → three fills
    const m = ms.fromIndex.get(a.id);
    expect(m.kind).toBe("split");
    expect(m.via).toBe("fused-loc");
    expect(m.from).toEqual([a.id]);
    expect(m.to).toHaveLength(3);
    for (const b of m.to) expect(p2.ops[b].loc).toBe("/m.0/Conv");
  });

  it("detects 2→1 merge through fused-loc provenance", () => {
    const a5 = byResult(p1.ops, "%5"); // /m.4/BN
    const a6 = byResult(p1.ops, "%6"); // /m.4/Scale
    const m = ms.fromIndex.get(a5.id);
    expect(m).toBe(ms.fromIndex.get(a6.id));
    expect(m.kind).toBe("merged");
    expect(m.from.sort()).toEqual([a5.id, a6.id].sort());
    expect(m.to).toHaveLength(1);
    expect(p2.ops[m.to[0]].locAll).toEqual(["/m.4/BN", "/m.4/Scale"]);
  });

  it("reports elimination (1→0) in removed", () => {
    const a = byResult(p1.ops, "%4"); // loc /m.3/Sub, gone in pass2
    expect(ms.removed).toContain(a.id);
    expect(ms.fromIndex.has(a.id)).toBe(false);
  });

  it("reports materialization (0→1) in added", () => {
    const b = byLoc(p2.ops, "/m.9/New")[0];
    expect(ms.added).toContain(b.id);
  });

  it("matches functions via symbol tier at confidence 1", () => {
    const f = p1.ops.find((o) => o.opName === "func.func");
    const m = ms.fromIndex.get(f.id);
    expect(m.via).toBe("symbol");
    expect(m.confidence).toBe(1);
  });

  it("matches loc-less ops via structure tier", () => {
    const c = p1.ops.find((o) => o.opName === "arith.constant");
    const m = ms.fromIndex.get(c.id);
    expect(m.via).toBe("structure");
    expect(m.kind).toBe("same");
  });
});

describe("matchSnapshots — pass2 → pass3 (split set shrinks)", () => {
  const p2 = load("pass2.mlir");
  const p3 = load("pass3.mlir");
  const ms = matchSnapshots(p2.ops, p2.graph, p3.ops, p3.graph);

  it("pairs survivors 1:1 and folds the extra into a sibling as merged", () => {
    const convs2 = byLoc(p2.ops, "/m.0/Conv");
    expect(convs2).toHaveLength(3);
    // All three share provenance with the two pass3 convs: none is
    // reported as removed; the surplus op folds into the best pair.
    for (const o of convs2) expect(ms.fromIndex.has(o.id)).toBe(true);
    const matches = new Set(convs2.map((o) => ms.fromIndex.get(o.id)));
    expect(matches.size).toBe(2);
    const merged = [...matches].find((m) => m.from.length === 2);
    expect(merged).toBeDefined();
    expect(merged.kind).toBe("merged");
  });
});

describe("matchSnapshots — manual overrides", () => {
  const p1 = load("pass1.mlir");
  const p2 = load("pass2.mlir");
  const k1 = keysForOps(p1.ops);
  const k2 = keysForOps(p2.ops);

  it("unlink dissolves an auto match into removed/added", () => {
    const a = byResult(p1.ops, "%2");
    const auto = matchSnapshots(p1.ops, p1.graph, p2.ops, p2.graph);
    const b = auto.fromIndex.get(a.id).to[0];
    const ms = matchSnapshots(p1.ops, p1.graph, p2.ops, p2.graph, [
      { action: "unlink", pair: [0, 1], from: [k1.get(a.id)], to: [k2.get(b)] },
    ]);
    expect(ms.fromIndex.has(a.id)).toBe(false);
    expect(ms.removed).toContain(a.id);
    expect(ms.added).toContain(b);
  });

  it("link creates a manual match and clears conflicting auto results", () => {
    const a = byResult(p1.ops, "%4"); // auto-removed
    const b = byLoc(p2.ops, "/m.9/New")[0]; // auto-added
    const ms = matchSnapshots(p1.ops, p1.graph, p2.ops, p2.graph, [
      { action: "link", pair: [0, 1], from: [k1.get(a.id)], to: [k2.get(b.id)] },
    ]);
    const m = ms.fromIndex.get(a.id);
    expect(m.via).toBe("manual");
    expect(m.confidence).toBe(1);
    expect(m.to).toEqual([b.id]);
    expect(ms.removed).not.toContain(a.id);
    expect(ms.added).not.toContain(b.id);
  });

  it("link with multiple targets records a manual split", () => {
    const a = byResult(p1.ops, "%4");
    const targets = byLoc(p2.ops, "/m.0/Conv").slice(0, 2);
    const ms = matchSnapshots(p1.ops, p1.graph, p2.ops, p2.graph, [
      {
        action: "link",
        pair: [0, 1],
        from: [k1.get(a.id)],
        to: targets.map((t) => k2.get(t.id)),
      },
    ]);
    const m = ms.fromIndex.get(a.id);
    expect(m.kind).toBe("split");
    expect(m.via).toBe("manual");
  });
});

describe("matchSnapshots — loc-less input (structure tier only)", () => {
  const SRC_A = `module {
  func.func @net() {
    %0 = tensor.empty() : tensor<8xf32>
    %1 = linalg.fill ins(%0 : tensor<8xf32>) outs(%0 : tensor<8xf32>) -> tensor<8xf32>
    %2 = linalg.fill ins(%1 : tensor<8xf32>) outs(%0 : tensor<8xf32>) -> tensor<8xf32>
    %3 = arith.addf %1, %2 : tensor<8xf32>
    util.return
  }
}`;
  const SRC_B = `module {
  func.func @net() {
    %0 = tensor.empty() : tensor<8xf32>
    %1 = linalg.fill ins(%0 : tensor<8xf32>) outs(%0 : tensor<8xf32>) -> tensor<8xf32>
    %2 = linalg.fill ins(%1 : tensor<8xf32>) outs(%0 : tensor<8xf32>) -> tensor<8xf32>
    %3 = arith.mulf %1, %2 : tensor<8xf32>
    util.return
  }
}`;

  it("aligns ops by opName ordinal without any locs", () => {
    const a = parseMLIR(SRC_A);
    const b = parseMLIR(SRC_B);
    const ms = matchSnapshots(a, buildGraph(a), b, buildGraph(b));
    const fills = a.filter((o) => o.opName === "linalg.fill");
    for (const f of fills) {
      const m = ms.fromIndex.get(f.id);
      expect(m).toBeDefined();
      expect(m.via).toBe("structure");
    }
    // addf → mulf: different opName buckets, no match on either side
    const addf = a.find((o) => o.opName === "arith.addf");
    expect(ms.removed).toContain(addf.id);
  });
});

describe("node keys", () => {
  const p1 = load("pass1.mlir");

  it("round-trips: every op resolves back to itself", () => {
    const keys = keysForOps(p1.ops);
    const list = [...keys.values()];
    const { ids, unresolved } = resolveKeys(list, p1.ops);
    expect(unresolved).toHaveLength(0);
    expect(ids).toEqual(p1.ops.map((o) => o.id));
  });

  it("disambiguates same-loc same-op ops by ordinal", () => {
    const p2 = load("pass2.mlir");
    const keys = keysForOps(p2.ops);
    const convKeys = byLoc(p2.ops, "/m.0/Conv").map((o) => keys.get(o.id));
    expect(new Set(convKeys).size).toBe(3);
  });

  it("degrades missing keys to unresolved, not errors", () => {
    const { ids, unresolved } = resolveKeys(
      ["@nope::s:@gone|0"],
      p1.ops
    );
    expect(ids).toHaveLength(0);
    expect(unresolved).toHaveLength(1);
  });
});

const YOLO_A = new URL("../yolov8n_readable/module.6.flow.mlir", import.meta.url);
const YOLO_B = new URL("../yolov8n_readable/module.7.stream.mlir", import.meta.url);

describe.skipIf(!existsSync(YOLO_A) || !existsSync(YOLO_B))(
  "matchSnapshots — real IREE flow → stream",
  () => {
    it("matches ≥70% of loc-carrying flow ops into stream, under budget", () => {
      const a = parseMLIR(readFileSync(YOLO_A, "utf8"));
      const b = parseMLIR(readFileSync(YOLO_B, "utf8"));
      const ga = buildGraph(a);
      const gb = buildGraph(b);
      const t0 = performance.now();
      const ms = matchSnapshots(a, ga, b, gb);
      const elapsed = performance.now() - t0;

      const candidates = a.filter((o) => o.loc && o.results.length > 0);
      const matched = candidates.filter((o) => ms.fromIndex.has(o.id));
      expect(matched.length / candidates.length).toBeGreaterThanOrEqual(0.7);
      expect(elapsed).toBeLessThan(1500);
    });
  }
);
