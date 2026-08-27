import { describe, it, expect, vi } from "vitest";
import { createSnapshotStore } from "../src/pipeline/snapshot-store.js";
import { naturalCompare } from "../src/pipeline/natural-sort.js";
import { contentHash } from "../src/pipeline/hash.js";

function makeStore() {
  const parse = vi.fn((text, name) => ({ text, name }));
  const match = vi.fn((a, b, ovr) => ({ a, b, ovr }));
  const store = createSnapshotStore({ parse, match, hash: contentHash });
  return { store, parse, match };
}

const FILES = [
  { name: "module.1.input.mlir", text: "aaa" },
  { name: "module.2.abi.mlir", text: "bbb" },
  { name: "module.3.flow.mlir", text: "ccc" },
];

describe("naturalCompare", () => {
  it("sorts digit runs numerically", () => {
    const names = [
      "module.10.x.mlir",
      "module.2.y.mlir",
      "module.1.z.mlir",
    ].sort(naturalCompare);
    expect(names).toEqual([
      "module.1.z.mlir",
      "module.2.y.mlir",
      "module.10.x.mlir",
    ]);
  });

  it("falls back to string comparison for non-digit segments", () => {
    expect(naturalCompare("a.mlir", "b.mlir")).toBeLessThan(0);
    expect(naturalCompare("a.mlir", "a.mlir")).toBe(0);
  });

  it("a strict prefix sorts first", () => {
    expect(naturalCompare("module.1", "module.1b")).toBeLessThan(0);
  });
});

describe("contentHash", () => {
  it("is deterministic and prefixed", () => {
    expect(contentHash("hello")).toBe(contentHash("hello"));
    expect(contentHash("hello")).toMatch(/^fnv1a64:[0-9a-f]{16}$/);
  });

  it("differs for different content", () => {
    expect(contentHash("hello")).not.toBe(contentHash("hello!"));
  });
});

describe("snapshot store", () => {
  it("parses lazily, once per index", () => {
    const { store, parse } = makeStore();
    store.load(FILES);
    expect(parse).not.toHaveBeenCalled();
    store.getParsed(1);
    store.getParsed(1);
    expect(parse).toHaveBeenCalledTimes(1);
    expect(parse).toHaveBeenCalledWith("bbb", "module.2.abi.mlir");
  });

  it("hashes every snapshot on load", () => {
    const { store } = makeStore();
    store.load(FILES);
    expect(store.snapshots.map((s) => s.hash)).toEqual(
      FILES.map((f) => contentHash(f.text))
    );
  });

  it("computes and caches pair matches", () => {
    const { store, match } = makeStore();
    store.load(FILES);
    store.getMatches(0);
    store.getMatches(0);
    expect(match).toHaveBeenCalledTimes(1);
    expect(store.getMatches(-1)).toBeNull();
    expect(store.getMatches(2)).toBeNull(); // last index has no next pair
  });

  it("invalidates only the touched pair on override changes", () => {
    const { store, match } = makeStore();
    store.load(FILES);
    store.getMatches(0);
    store.getMatches(1);
    expect(match).toHaveBeenCalledTimes(2);

    store.addOverride({ pair: [1, 2], action: "link", from: [], to: [] });
    store.getMatches(0); // still cached
    expect(match).toHaveBeenCalledTimes(2);
    store.getMatches(1); // recomputed with the override
    expect(match).toHaveBeenCalledTimes(3);
    expect(match.mock.calls[2][2]).toHaveLength(1);

    store.removeOverride(0);
    store.getMatches(1);
    expect(match).toHaveBeenCalledTimes(4);
    expect(match.mock.calls[3][2]).toHaveLength(0);
  });

  it("invalidateParses drops parse and match caches", () => {
    const { store, parse, match } = makeStore();
    store.load(FILES);
    store.getMatches(0);
    store.invalidateParses();
    store.getMatches(0);
    expect(parse.mock.calls.length).toBeGreaterThanOrEqual(4);
    expect(match).toHaveBeenCalledTimes(2);
  });

  it("load replaces series and clears overrides", () => {
    const { store } = makeStore();
    store.load(FILES);
    store.addOverride({ pair: [0, 1], action: "link", from: [], to: [] });
    store.load(FILES.slice(0, 2));
    expect(store.length).toBe(2);
    expect(store.overrides).toHaveLength(0);
  });

  it("warm fills neighbor parse/match caches", () => {
    const { store, parse, match } = makeStore();
    store.load(FILES);
    store.getParsed(1);
    store.warm(1);
    expect(parse).toHaveBeenCalledTimes(3);
    expect(match).toHaveBeenCalledTimes(2); // pairs 0↔1 and 1↔2
  });
});
