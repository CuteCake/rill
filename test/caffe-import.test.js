import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { parsePrototxt } from "../src/parser/prototxt.js";
import { applyImportMapping } from "../src/parser/import-map.js";
import { buildGraph } from "../src/graph/build-graph.js";
import { BUILTIN_CAFFE_PROFILE } from "../src/extensions/profiles/caffe.js";
import { createRegistry, builtinProfiles } from "../src/extensions/registry.js";
import { validateProfile } from "../src/extensions/validate.js";
import { parseSource, detectImporter } from "../src/parser/index.js";

const CAFFE_IMPORT = BUILTIN_CAFFE_PROFILE.import;

function importText(src, cfg = CAFFE_IMPORT) {
  const { root, errors } = parsePrototxt(src);
  expect(errors).toEqual([]);
  return applyImportMapping(root, cfg);
}

describe("op contract", () => {
  const lenet = readFileSync("test/fixtures/lenet.prototxt", "utf-8");

  it("maps LeNet with id === array index and unique result names", () => {
    const { ops, warnings } = importText(lenet);
    expect(warnings).toEqual([]);
    expect(ops).toHaveLength(9);
    ops.forEach((op, i) => expect(op.id).toBe(i));
    const allResults = ops.flatMap((o) => o.results);
    expect(new Set(allResults).size).toBe(allResults.length);
    for (const op of ops) {
      expect(op.results.length).toBeGreaterThan(0);
      expect(op.dialect).toBe("caffe");
      expect(op.parentId).toBeNull();
    }
  });

  it("reproduces the layer chain as def-use edges", () => {
    const { ops } = importText(lenet);
    const { edges } = buildGraph(ops);
    const byName = Object.fromEntries(ops.map((o) => [o.attrs.name, o.id]));
    const has = (a, b) =>
      edges.some((e) => e.from === byName[a] && e.to === byName[b]);
    expect(has("data", "conv1")).toBe(true);
    expect(has("conv1", "pool1")).toBe(true);
    expect(has("pool2", "ip1")).toBe(true);
    expect(has("ip1", "relu1")).toBe(true); // into the in-place ReLU
    expect(has("relu1", "ip2")).toBe(true); // out of it, not from ip1
    expect(has("ip1", "ip2")).toBe(false);
    expect(edges.every((e) => e.from !== e.to)).toBe(true);
  });

  it("tracks source lines for SourceView highlighting", () => {
    const { ops } = importText(lenet);
    const conv1 = ops.find((o) => o.attrs.name === "conv1");
    expect(conv1.line).toBe(15);
  });
});

describe("in-place layers", () => {
  it("versions redefinitions so each result name has one def", () => {
    const { ops, warnings } = importText(`layer { name: "c1" type: "Convolution" bottom: "data" top: "conv1" }
layer { name: "relu" type: "ReLU" bottom: "conv1" top: "conv1" }
layer { name: "c2" type: "Convolution" bottom: "conv1" top: "conv2" }`);
    expect(warnings).toEqual([]); // in-place is normal, not warned
    const relu = ops.find((o) => o.attrs.name === "relu");
    expect(relu.operands).toEqual(["conv1"]);
    expect(relu.results).toEqual(["conv1@1"]);
    expect(relu.rawResults).toEqual(["conv1"]); // display keeps plain name
    const c2 = ops.find((o) => o.attrs.name === "c2");
    expect(c2.operands).toEqual(["conv1@1"]);
    expect(c2.rawOperands).toEqual(["conv1"]);
  });

  it("chains of in-place layers keep versioning (BN→Scale→ReLU)", () => {
    const { ops } = importText(`layer { name: "conv" type: "Convolution" bottom: "in" top: "x" }
layer { name: "bn" type: "BatchNorm" bottom: "x" top: "x" }
layer { name: "scale" type: "Scale" bottom: "x" top: "x" }
layer { name: "relu" type: "ReLU" bottom: "x" top: "x" }
layer { name: "next" type: "Convolution" bottom: "x" top: "y" }`);
    const { edges } = buildGraph(ops);
    // Strictly linear: conv→bn→scale→relu→next, 4 edges, no skips
    expect(edges).toHaveLength(4);
    const seq = ops.map((o) => o.id);
    for (let i = 1; i < seq.length; i++) {
      expect(edges.some((e) => e.from === seq[i - 1] && e.to === seq[i])).toBe(true);
    }
  });

  it("warns on duplicate non-in-place definitions", () => {
    const { warnings } = importText(`layer { name: "a" type: "Convolution" bottom: "in" top: "out" }
layer { name: "b" type: "Convolution" bottom: "in" top: "out" }`);
    expect(warnings.some((w) => w.includes('"out" redefined by layer "b"'))).toBe(true);
  });
});

describe("legacy V1 variant", () => {
  it("falls back to the `layers` list and maps enum types", () => {
    const { ops } = importText(`layers { name: "conv1" type: CONVOLUTION bottom: "data" top: "conv1" }
layers { name: "pool1" type: POOLING bottom: "conv1" top: "pool1" }`);
    expect(ops).toHaveLength(2);
    expect(ops[0].opName).toBe("caffe.Convolution");
    expect(ops[1].opName).toBe("caffe.Pooling");
  });

  it("passes unmapped custom types through", () => {
    const { ops } = importText(
      `layer { name: "n" type: "LayerNorm" bottom: "a" top: "b" layer_norm_param { axis: 1 eps: 1e-06 } }`
    );
    expect(ops[0].opName).toBe("caffe.LayerNorm");
    expect(ops[0].attrs.axis).toBe(1);
    expect(ops[0].attrs.eps).toBe(1e-6);
  });
});

describe("net inputs and drops", () => {
  it("synthesizes input ops from input_shape blocks", () => {
    const { ops } = importText(`input: "data"
input_shape { dim: 1 dim: 3 dim: 224 dim: 224 }
layer { name: "c" type: "Convolution" bottom: "data" top: "c" }`);
    expect(ops[0].opName).toBe("caffe.input");
    expect(ops[0].results).toEqual(["data"]);
    expect(ops[0].types).toEqual(["1×3×224×224"]);
    const { edges } = buildGraph(ops);
    expect(edges).toEqual([{ from: 0, to: 1, value: "data" }]);
  });

  it("synthesizes input ops from legacy flat input_dim quads", () => {
    const { ops } = importText(`input: "a"
input: "b"
input_dim: 1
input_dim: 3
input_dim: 8
input_dim: 8
input_dim: 1
input_dim: 10
input_dim: 4
input_dim: 4`);
    expect(ops).toHaveLength(2);
    expect(ops[0].types).toEqual(["1×3×8×8"]);
    expect(ops[1].types).toEqual(["1×10×4×4"]);
  });

  it("drops layers matched by drop rules (TEST phase)", () => {
    const { ops } = importText(`layer { name: "acc" type: "Accuracy" bottom: "p" bottom: "l" top: "acc" include { phase: TEST } }
layer { name: "keep" type: "Softmax" bottom: "p" top: "s" include { phase: TRAIN } }`);
    expect(ops.map((o) => o.attrs.name)).toEqual(["keep"]);
  });

  it("synthesizes a sink result for zero-top layers so they render", () => {
    const { ops } = importText(
      `layer { name: "sink" type: "Silence" bottom: "x" }`
    );
    expect(ops[0].results).toEqual(["sink!out"]);
    expect(ops[0].rawResults).toEqual([]);
  });
});

describe("display templates and grouping", () => {
  it("renders repeated-field templates ({path*} joins with ×)", () => {
    const { ops } = importText(`layer {
  name: "Conv_0" type: "Convolution" bottom: "in" top: "out"
  convolution_param { num_output: 96 kernel_size: 4 kernel_size: 4 }
}`);
    expect(ops[0].types).toEqual(["96×4×4"]);
  });

  it("skips a template with missing placeholders and tries the next rule", () => {
    const { ops } = importText(`layer {
  name: "p" type: "Pooling" bottom: "a" top: "b"
  pooling_param { pool: AVE }
}`);
    // kernel_size/stride absent → falls through to the bare {pooling_param.pool} rule
    expect(ops[0].types).toEqual(["AVE"]);
  });

  it("derives loc groups from delimited names shared by ≥2 layers", () => {
    const { ops } = importText(`layer { name: "conv1/bn" type: "BatchNorm" bottom: "x" top: "a" }
layer { name: "conv1/scale" type: "Scale" bottom: "a" top: "b" }
layer { name: "lonely/relu" type: "ReLU" bottom: "b" top: "c" }`);
    expect(ops[0].locPrefix).toBe("conv1");
    expect(ops[1].locPrefix).toBe("conv1");
    expect(ops[2].locPrefix).toBeNull(); // singleton prefixes don't group
  });
});

describe("user sample (custom variant with LayerNorm)", () => {
  const sample = readFileSync("test/fixtures/example_prototxt.prototxt", "utf-8");

  it("maps the Input→Convolution→LayerNorm chain", () => {
    const { ops, warnings } = importText(sample);
    expect(warnings).toEqual([]);
    expect(ops.map((o) => o.opName)).toEqual([
      "caffe.Input",
      "caffe.Convolution",
      "caffe.LayerNorm",
    ]);
    const { edges } = buildGraph(ops);
    expect(edges).toHaveLength(2);
    // Conv display from repeated kernel_size; Input shape from input_param
    expect(ops[0].types).toEqual(["1×3×224×224"]);
    expect(ops[1].types).toEqual(["96×4×4"]);
    // collectParams hoists custom layer_norm_param scalars
    expect(ops[2].attrs.eps).toBe(1e-6);
    expect(ops[2].attrs.uses_mean).toBe(true);
  });
});

describe("front-end dispatch", () => {
  const registry = createRegistry(builtinProfiles);
  const PROTO = `layer { name: "c" type: "Convolution" bottom: "a" top: "b" }`;
  const MLIR = `module {\n  %0 = arith.constant 1 : i32\n}`;

  it("routes .prototxt files to the importer by extension", () => {
    const { ops, format } = parseSource(PROTO, "net.prototxt", registry);
    expect(format).toBe("prototxt");
    expect(ops[0].opName).toBe("caffe.Convolution");
  });

  it("sniffs prototxt content in .txt files", () => {
    expect(parseSource(PROTO, "net.txt", registry).format).toBe("prototxt");
  });

  it("still parses MLIR through the MLIR parser", () => {
    const { ops, format } = parseSource(MLIR, "x.mlir", registry);
    expect(format).toBe("mlir");
    expect(ops.some((o) => o.opName === "arith.constant")).toBe(true);
  });

  it("a user profile's import section wins over the built-in", () => {
    const custom = {
      name: "my-variant",
      import: {
        format: "prototxt",
        detect: { extensions: ["prototxt"] },
        dialect: "mynet",
        nodes: { list: "node", name: "id", type: "kind", inputs: "in", outputs: "out" },
      },
    };
    const stacked = createRegistry([custom, ...builtinProfiles]);
    expect(detectImporter("", "x.prototxt", stacked.profiles).name).toBe("my-variant");
    const { ops } = parseSource(
      `node { id: "n1" kind: "Blur" in: "a" out: "b" }`,
      "x.prototxt",
      stacked
    );
    expect(ops[0].opName).toBe("mynet.Blur");
    expect(ops[0].dialect).toBe("mynet");
  });

  it("surfaces prototxt syntax errors as warnings", () => {
    const { warnings } = parseSource(`layer { name: "x"`, "x.prototxt", registry);
    expect(warnings.length).toBeGreaterThan(0);
  });
});

describe("registry integration", () => {
  it("built-in caffe profile validates and classifies", () => {
    const res = validateProfile(BUILTIN_CAFFE_PROFILE);
    expect(res.errors).toEqual([]);
    expect(res.ok).toBe(true);

    const registry = createRegistry(builtinProfiles);
    const op = (opName, extra = {}) => ({
      opName,
      dialect: "caffe",
      results: ["x"],
      operands: [],
      attrs: {},
      isRegion: false,
      genericBody: null,
      ...extra,
    });
    expect(registry.classify(op("caffe.Dropout"))).toBe("aux");
    expect(registry.classify(op("caffe.Silence"))).toBe("structural");
    expect(registry.classify(op("caffe.Convolution"))).toBe("compute");
    expect(registry.summarize(op("caffe.Convolution")).label).toBe("conv");
    expect(registry.summarize(op("caffe.LayerNorm")).label).toBe("norm");
  });
});
