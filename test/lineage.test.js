import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseMLIR } from "../src/parser/mlir-parser.js";
import { buildGraph } from "../src/graph/build-graph.js";
import { matchSnapshots } from "../src/pipeline/match.js";
import { createSnapshotStore } from "../src/pipeline/snapshot-store.js";
import { contentHash } from "../src/pipeline/hash.js";
import { keysForOps } from "../src/pipeline/node-key.js";
import { probeLineage } from "../src/pipeline/lineage.js";
import { diffSets, translatePositions, ghostNodes } from "../src/pipeline/step-context.js";

const read = (name) =>
  readFileSync(new URL(`./fixtures/pipeline/${name}`, import.meta.url), "utf8");

function makeStore(overrides = []) {
  const store = createSnapshotStore({
    parse: (text) => {
      const ops = parseMLIR(text);
      return { ops, graph: buildGraph(ops) };
    },
    match: (a, b, ovr) => matchSnapshots(a.ops, a.graph, b.ops, b.graph, ovr),
    hash: contentHash,
  });
  store.load([
    { name: "pass1.mlir", text: read("pass1.mlir") },
    { name: "pass2.mlir", text: read("pass2.mlir") },
    { name: "pass3.mlir", text: read("pass3.mlir") },
  ]);
  for (const o of overrides) store.addOverride(o);
  return store;
}

const byResult = (ops, r) => ops.find((o) => o.rawResults.includes(r));

describe("probeLineage", () => {
  it("follows a split forward and keeps membership per snapshot", () => {
    const store = makeStore();
    const p1 = store.getParsed(0);
    const conv = byResult(p1.ops, "%1"); // /m.0/Conv, splits into 3 in pass2
    const keys = keysForOps(p1.ops);
    const per = probeLineage({ originIndex: 0, keys: [keys.get(conv.id)] }, store);

    expect(per[0].ids.has(conv.id)).toBe(true);
    expect(per[1].ids.size).toBe(3);
    expect(per[1].events.some((e) => e.kind === "split")).toBe(true);
    // pass3 folds one sibling into another: all lineage members persist
    expect(per[2].ids.size).toBe(2);
  });

  it("follows lineage backward from a later snapshot", () => {
    const store = makeStore();
    const p2 = store.getParsed(1);
    const mergedOp = p2.ops.find(
      (o) => o.locAll && o.locAll.includes("/m.4/BN")
    );
    const keys = keysForOps(p2.ops);
    const per = probeLineage({ originIndex: 1, keys: [keys.get(mergedOp.id)] }, store);

    // Backward through the 2→1 merge: both pass1 sources join the lineage
    expect(per[0].ids.size).toBe(2);
    expect(per[0].events.some((e) => e.kind === "merged")).toBe(true);
  });

  it("reports elimination and respects manual overrides", () => {
    const plain = makeStore();
    const p1 = plain.getParsed(0);
    const sub = byResult(p1.ops, "%4"); // /m.3/Sub, eliminated in pass2
    const k1 = keysForOps(p1.ops);
    const perPlain = probeLineage({ originIndex: 0, keys: [k1.get(sub.id)] }, plain);
    expect(perPlain[1].ids.size).toBe(0);
    expect(perPlain[1].events.some((e) => e.kind === "removed")).toBe(true);

    // Manually link %4 to the /m.9/New op: lineage reroutes
    const p2 = plain.getParsed(1);
    const target = p2.ops.find((o) => o.loc === "/m.9/New");
    const k2 = keysForOps(p2.ops);
    const overridden = makeStore([
      { pair: [0, 1], action: "link", from: [k1.get(sub.id)], to: [k2.get(target.id)] },
    ]);
    const per = probeLineage({ originIndex: 0, keys: [k1.get(sub.id)] }, overridden);
    expect(per[1].ids.has(target.id)).toBe(true);
  });

  it("surfaces unresolved keys instead of throwing", () => {
    const store = makeStore();
    const per = probeLineage({ originIndex: 0, keys: ["@x::s:@gone|0"] }, store);
    expect(per.unresolved).toHaveLength(1);
    expect(per[0].ids.size).toBe(0);
  });
});

describe("step-context", () => {
  it("diffSets buckets current-snapshot ids by match kind", () => {
    const store = makeStore();
    const ms = store.getMatches(0);
    const p2 = store.getParsed(1);
    const d = diffSets(ms);
    const newOp = p2.ops.find((o) => o.loc === "/m.9/New");
    expect(d.added.has(newOp.id)).toBe(true);
    const widened = p2.ops.find((o) => o.loc === "/m.2/Mul");
    expect(d.changed.has(widened.id)).toBe(true);
    const convs = p2.ops.filter((o) => o.loc === "/m.0/Conv");
    for (const c of convs) expect(d.split.has(c.id)).toBe(true);
  });

  it("translatePositions pins 1:1 targets and seeds one split member", () => {
    const store = makeStore();
    const ms = store.getMatches(0);
    const p1 = store.getParsed(0);
    const prevPosById = new Map(p1.ops.map((o) => [o.id, { x: o.id * 10, y: 5 }]));
    const seeded = translatePositions(prevPosById, ms, true);

    const p2 = store.getParsed(1);
    const addOp1 = byResult(p1.ops, "%2");
    const m = ms.fromIndex.get(addOp1.id);
    expect(seeded.get(m.to[0])).toEqual({ x: addOp1.id * 10, y: 5 });

    const split = ms.fromIndex.get(byResult(p1.ops, "%1").id);
    const seededMembers = split.to.filter((b) => seeded.has(b));
    expect(seededMembers).toHaveLength(1);
    expect(p2.ops.length).toBeGreaterThan(0);
  });

  it("ghostNodes returns removed rects from the previous layout", () => {
    const store = makeStore();
    const ms = store.getMatches(0);
    const p1 = store.getParsed(0);
    const fakeLayout = {
      nodes: p1.ops.map((o) => ({ node: o, x: 1, y: 2, w: 3, h: 4, isAux: false })),
    };
    const ghosts = ghostNodes(ms, fakeLayout);
    const sub = byResult(p1.ops, "%4");
    expect(ghosts.some((g) => g.loc === sub.loc)).toBe(true);
  });
});
