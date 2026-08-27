import { describe, it, expect } from "vitest";
import { parseMLIR } from "../src/parser/mlir-parser.js";
import { buildGraph } from "../src/graph/build-graph.js";
import { matchSnapshots } from "../src/pipeline/match.js";
import { classifyRemovedOps, removalNote } from "../src/pipeline/ghosts.js";

const wrap = (body) => `module {
  func.func @main() {
${body}
    util.return
  }
}`;

function load(body) {
  const ops = parseMLIR(wrap(body));
  return { ops, graph: buildGraph(ops) };
}

const byLoc = (ops, loc) => ops.find((o) => o.loc === loc);

function classify(a, b) {
  const ms = matchSnapshots(a.ops, a.graph, b.ops, b.graph);
  return { ms, cls: classifyRemovedOps(ms, a.graph, b.graph) };
}

// A → X → B chains, varied per scenario
const CHAIN_AXB = `    %a = tensor.empty() : tensor<4xf32> loc("/g/A")
    %x = linalg.fill ins(%a : tensor<4xf32>) outs(%a : tensor<4xf32>) -> tensor<4xf32> loc("/g/X")
    %b = linalg.fill ins(%x : tensor<4xf32>) outs(%x : tensor<4xf32>) -> tensor<4xf32> loc("/g/B")`;

describe("classifyRemovedOps", () => {
  it("classifies A→X→B becoming A→B as 'bypassed' with the corridor", () => {
    const a = load(CHAIN_AXB);
    const b = load(`    %a = tensor.empty() : tensor<4xf32> loc("/g/A")
    %b = linalg.fill ins(%a : tensor<4xf32>) outs(%a : tensor<4xf32>) -> tensor<4xf32> loc("/g/B")`);
    const { ms, cls } = classify(a, b);
    const x = byLoc(a.ops, "/g/X");
    expect(ms.removed).toContain(x.id);
    const c = cls.get(x.id);
    expect(c.kind).toBe("bypassed");
    expect(b.ops[c.producer].loc).toBe("/g/A");
    expect(b.ops[c.consumer].loc).toBe("/g/B");
  });

  it("classifies A→X→B becoming A→Y→B as 'replaced' by the added op", () => {
    const a = load(CHAIN_AXB);
    const b = load(`    %a = tensor.empty() : tensor<4xf32> loc("/g/A")
    %y = linalg.fill ins(%a : tensor<4xf32>) outs(%a : tensor<4xf32>) -> tensor<4xf32> loc("/g/Y")
    %b = linalg.fill ins(%y : tensor<4xf32>) outs(%y : tensor<4xf32>) -> tensor<4xf32> loc("/g/B")`);
    const { cls } = classify(a, b);
    const x = byLoc(a.ops, "/g/X");
    const c = cls.get(x.id);
    expect(c.kind).toBe("replaced");
    expect(b.ops[c.replacedBy].loc).toBe("/g/Y");
    expect(removalNote(c, b.ops)).toBe("replaced by linalg.fill");
  });

  it("classifies a folded source op as 'neighbor' on its consumer side", () => {
    const a = load(`    %a = tensor.empty() : tensor<4xf32> loc("/g/A")
    %k = arith.constant dense<1.0> : tensor<4xf32> loc("/g/K")
    %b = linalg.fill ins(%k : tensor<4xf32>) outs(%a : tensor<4xf32>) -> tensor<4xf32> loc("/g/B")`);
    const b = load(`    %a = tensor.empty() : tensor<4xf32> loc("/g/A")
    %b = linalg.fill ins(%a : tensor<4xf32>) outs(%a : tensor<4xf32>) -> tensor<4xf32> loc("/g/B")`);
    const { cls } = classify(a, b);
    const k = byLoc(a.ops, "/g/K");
    const c = cls.get(k.id);
    expect(c.kind).toBe("neighbor");
    expect(c.side).toBe("consumer");
    expect(b.ops[c.anchorId].loc).toBe("/g/B");
    expect(removalNote(c, b.ops)).toBeUndefined();
  });

  it("classifies a fully dead region as 'isolated'", () => {
    const a = load(`    %a = tensor.empty() : tensor<4xf32> loc("/g/A")
    %x = tensor.empty() : tensor<4xf32> loc("/dead/X")
    %z = linalg.fill ins(%x : tensor<4xf32>) outs(%x : tensor<4xf32>) -> tensor<4xf32> loc("/dead/Z")`);
    const b = load(`    %a = tensor.empty() : tensor<4xf32> loc("/g/A")`);
    const { cls } = classify(a, b);
    expect(cls.get(byLoc(a.ops, "/dead/X").id).kind).toBe("isolated");
    expect(cls.get(byLoc(a.ops, "/dead/Z").id).kind).toBe("isolated");
  });

  it("chases through removed chains: A→X1→X2→B collapsing to A→B", () => {
    const a = load(`    %a = tensor.empty() : tensor<4xf32> loc("/g/A")
    %x1 = linalg.fill ins(%a : tensor<4xf32>) outs(%a : tensor<4xf32>) -> tensor<4xf32> loc("/g/X1")
    %x2 = linalg.fill ins(%x1 : tensor<4xf32>) outs(%x1 : tensor<4xf32>) -> tensor<4xf32> loc("/g/X2")
    %b = linalg.fill ins(%x2 : tensor<4xf32>) outs(%x2 : tensor<4xf32>) -> tensor<4xf32> loc("/g/B")`);
    const b = load(`    %a = tensor.empty() : tensor<4xf32> loc("/g/A")
    %b = linalg.fill ins(%a : tensor<4xf32>) outs(%a : tensor<4xf32>) -> tensor<4xf32> loc("/g/B")`);
    const { cls } = classify(a, b);
    for (const loc of ["/g/X1", "/g/X2"]) {
      const c = cls.get(byLoc(a.ops, loc).id);
      expect(c.kind).toBe("bypassed");
      expect(b.ops[c.producer].loc).toBe("/g/A");
      expect(b.ops[c.consumer].loc).toBe("/g/B");
    }
  });
});
