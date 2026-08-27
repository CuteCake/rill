import { describe, it, expect } from "vitest";
import { parsePrototxt, getAll, getFirst, getValues } from "../src/parser/prototxt.js";

const BASIC = `name: "LeNet"
layer {
  name: "conv1"
  type: "Convolution"
  bottom: "data"
  top: "conv1"
  convolution_param {
    num_output: 20
    kernel_size: 5
    stride: 1
  }
}`;

describe("parsePrototxt scalars", () => {
  it("parses quoted strings, ints, floats, negatives, exponents", () => {
    const { root, errors } = parsePrototxt(`s: "hi"
i: 42
f: 0.5
neg: -3
exp: 1e-06
lead: .25`);
    expect(errors).toEqual([]);
    expect(getFirst(root, "s")).toBe("hi");
    expect(getFirst(root, "i")).toBe(42);
    expect(getFirst(root, "f")).toBe(0.5);
    expect(getFirst(root, "neg")).toBe(-3);
    expect(getFirst(root, "exp")).toBe(1e-6);
    expect(getFirst(root, "lead")).toBe(0.25);
  });

  it("parses bools and bare enum idents", () => {
    const { root } = parsePrototxt(`a: true
b: false
phase: TEST
pool: MAX`);
    expect(getFirst(root, "a")).toBe(true);
    expect(getFirst(root, "b")).toBe(false);
    expect(getFirst(root, "phase")).toBe("TEST");
    expect(getFirst(root, "pool")).toBe("MAX");
  });

  it("handles string escapes and adjacent-string concatenation", () => {
    const { root } = parsePrototxt(`a: "he said \\"hi\\""
b: "one" "two"`);
    expect(getFirst(root, "a")).toBe('he said "hi"');
    expect(getFirst(root, "b")).toBe("onetwo");
  });
});

describe("parsePrototxt structure", () => {
  it("parses nested messages and dotted-path access", () => {
    const { root, errors } = parsePrototxt(BASIC);
    expect(errors).toEqual([]);
    expect(getFirst(root, "name")).toBe("LeNet");
    const layer = getAll(root, "layer")[0].m;
    expect(getFirst(layer, "type")).toBe("Convolution");
    expect(getFirst(layer, "convolution_param.num_output")).toBe(20);
  });

  it("collects repeated keys as separate entries", () => {
    const { root } = parsePrototxt(`layer {
  pad: 0
  pad: 0
  pad: 1
  kernel_size: 4
  kernel_size: 4
}`);
    const layer = getAll(root, "layer")[0].m;
    expect(getValues(layer, "pad")).toEqual([0, 0, 1]);
    expect(getValues(layer, "kernel_size")).toEqual([4, 4]);
  });

  it("supports colon-brace, angle-bracket, and short-form list syntax", () => {
    const { root, errors } = parsePrototxt(`a: { x: 1 }
b < y: 2 >
c: [3, 4, 5]`);
    expect(errors).toEqual([]);
    expect(getFirst(root, "a.x")).toBe(1);
    expect(getFirst(root, "b.y")).toBe(2);
    expect(getValues(root, "c")).toEqual([3, 4, 5]);
  });

  it("ignores comments and CRLF line endings", () => {
    const { root, errors } = parsePrototxt(
      '# header comment\r\nlayer { # trailing\r\n  name: "x" # after value\r\n}\r\n'
    );
    expect(errors).toEqual([]);
    expect(getFirst(root, "layer.name")).toBe("x");
  });

  it("walks nested repeated dims via getValues", () => {
    const { root } = parsePrototxt(`input_param {
  shape {
    dim: 1
    dim: 3
    dim: 224
    dim: 224
  }
}`);
    expect(getValues(root, "input_param.shape.dim")).toEqual([1, 3, 224, 224]);
  });
});

describe("parsePrototxt line tracking", () => {
  it("records lines on entries and __line on messages", () => {
    const { root } = parsePrototxt(BASIC);
    const layerEntry = getAll(root, "layer")[0];
    expect(layerEntry.line).toBe(2);
    expect(layerEntry.m.__line).toBe(2);
    expect(getAll(layerEntry.m, "type")[0].line).toBe(4);
    const conv = getFirst(layerEntry.m, "convolution_param");
    expect(conv.__line).toBe(7);
  });

  it("keeps __line non-enumerable so messages serialize cleanly", () => {
    const { root } = parsePrototxt(`a { x: 1 }`);
    const msg = getFirst(root, "a");
    expect(Object.keys(msg)).toEqual(["x"]);
    expect(JSON.stringify(msg)).not.toContain("__line");
  });
});

describe("parsePrototxt error recovery", () => {
  it("reports unclosed blocks with line numbers but returns partial tree", () => {
    const { root, errors } = parsePrototxt(`layer {
  name: "a"
layer {
  name: "b"
}`);
    // The stray open brace swallows the second layer as best-effort nesting;
    // what matters: an error is reported with the offending line, no throw.
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toMatch(/line 1/);
    expect(getAll(root, "layer").length).toBeGreaterThan(0);
  });

  it("reports unexpected tokens and continues", () => {
    const { root, errors } = parsePrototxt(`} stray
name: "ok"`);
    expect(errors.length).toBeGreaterThan(0);
    expect(getFirst(root, "name")).toBe("ok");
  });

  it("reports unterminated strings", () => {
    const { errors } = parsePrototxt(`name: "oops`);
    expect(errors.some((e) => e.includes("unterminated"))).toBe(true);
  });

  it("handles empty and comment-only input", () => {
    expect(parsePrototxt("").errors).toEqual([]);
    expect(parsePrototxt("# nothing here\n").errors).toEqual([]);
  });
});
