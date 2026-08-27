import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { buildAiKit, buildSmartSample } from "../src/utils/ai-kit.js";
import { parseMLIR } from "../src/parser/mlir-parser.js";
import { parsePrototxt } from "../src/parser/prototxt.js";
import { applyImportMapping } from "../src/parser/import-map.js";
import { BUILTIN_CAFFE_PROFILE } from "../src/extensions/profiles/caffe.js";

/** A dump whose head is a wall of constants — a raw prefix would never
 *  reach the ops that actually need profile rules. */
function constantWallMLIR() {
  const head = [];
  for (let i = 0; i < 2000; i++) {
    head.push(`  %c${i} = arith.constant ${i} : i32`);
  }
  return `module {\n${head.join("\n")}\n  %x = mydsl.rare_shard %c0 : tensor<4xf32>\n  %y = mydsl.all_reduce %x : tensor<4xf32>\n}`;
}

describe("buildAiKit", () => {
  it("bundles the system prompt and both specs, in order, before the sample", () => {
    const src = 'layer { name: "c" type: "Convolution" bottom: "a" top: "b" }';
    const { root } = parsePrototxt(src);
    const { ops } = applyImportMapping(root, BUILTIN_CAFFE_PROFILE.import);
    const kit = buildAiKit(src, "net.prototxt", ops);
    expect(kit).toContain("You are helping me author a profile for Rill");
    expect(kit).toContain("Dialect Profile Specification");
    expect(kit).toContain("Import Mapping Specification");
    expect(kit).toContain("SAMPLE INPUT · net.prototxt");
    const order = [
      kit.indexOf("You are helping"),
      kit.indexOf("SPEC 1/2"),
      kit.indexOf("SPEC 2/2"),
      kit.indexOf("SAMPLE INPUT"),
    ];
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
});

describe("buildSmartSample", () => {
  it("includes ops a raw prefix would miss (constant-wall dump)", () => {
    const src = constantWallMLIR();
    const ops = parseMLIR(src);
    const sample = buildSmartSample(src, ops);
    // These live ~60KB into the file, far past any prefix budget
    expect(sample).toContain("mydsl.rare_shard");
    expect(sample).toContain("mydsl.all_reduce");
    expect(sample).toContain("mydsl");
    expect(sample.length).toBeLessThanOrEqual(30000);
  });

  it("inventory lists every distinct op of a real dump, with counts", () => {
    const src = readFileSync("test/fixtures/global-optimization.mlir", "utf-8");
    const ops = parseMLIR(src);
    const sample = buildSmartSample(src, ops);
    const distinct = new Set(ops.filter((o) => o.opName).map((o) => o.opName));
    for (const name of distinct) {
      expect(sample, `inventory missing ${name}`).toContain(name);
    }
    expect(sample).toContain("OP INVENTORY (complete");
    expect(sample.length).toBeLessThanOrEqual(40000);
  });

  it("includes distinct captured region bodies for `when` rules", () => {
    const src = readFileSync("test/fixtures/global-optimization.mlir", "utf-8");
    const ops = parseMLIR(src);
    const sample = buildSmartSample(src, ops);
    if (ops.some((o) => o.genericBody && o.genericBody.length)) {
      expect(sample).toContain("REGION BODIES");
    }
  });

  it("includes a contiguous context excerpt from the op-dense region", () => {
    const src = constantWallMLIR();
    const sample = buildSmartSample(src, parseMLIR(src));
    expect(sample).toMatch(/CONTEXT EXCERPT \(contiguous lines \d+–\d+/);
  });

  it("keeps the raw head for file framing", () => {
    const src = `name: "LeNet"\nlayer { name: "c" type: "Convolution" bottom: "a" top: "b" }`;
    const { root } = parsePrototxt(src);
    const { ops } = applyImportMapping(root, BUILTIN_CAFFE_PROFILE.import);
    const sample = buildSmartSample(src, ops);
    expect(sample).toContain("RAW HEAD");
    expect(sample).toContain('name: "LeNet"'); // real prototxt syntax, not synthesized ops
  });

  it("falls back to head + tail when nothing parsed", () => {
    const src = "A".repeat(30000) + "UNIQUE_TAIL_MARKER";
    const sample = buildSmartSample(src, []);
    expect(sample).toContain("AAAA");
    expect(sample).toContain("UNIQUE_TAIL_MARKER");
    expect(sample).toContain("middle omitted");
    expect(sample.length).toBeLessThanOrEqual(25000);
  });

  it("handles empty source and ops", () => {
    expect(buildSmartSample("", [])).toBe("");
  });
});
