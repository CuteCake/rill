import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { parseMLIR } from "../src/parser/mlir-parser.js";

const FIXTURE = readFileSync(
  new URL("./fixtures/pipeline/fused-locs.mlir", import.meta.url),
  "utf8"
);

const byResult = (ops, name) => ops.find((o) => o.rawResults.includes(name));

describe("fused loc parsing", () => {
  const ops = parseMLIR(FIXTURE);

  it("flattens fused[#a, #b] to leaves, first leaf becomes op.loc", () => {
    const op = byResult(ops, "%0");
    expect(op.loc).toBe("/model.0/conv/Conv");
    expect(op.locPrefix).toBe("/model.0");
    expect(op.locAll).toEqual(["/model.0/conv/Conv", "/model.0/bn/BatchNorm"]);
  });

  it("resolves alias-of-alias fused chains in order", () => {
    const op = byResult(ops, "%1");
    expect(op.locAll).toEqual([
      "/model.0/conv/Conv",
      "/model.0/bn/BatchNorm",
      "/model.1/act/SiLU",
    ]);
  });

  it("handles fused metadata and mixed alias/string elements", () => {
    const op = byResult(ops, "%2");
    expect(op.locAll).toEqual([
      "/model.0/bn/BatchNorm",
      "/model.1/pool/MaxPool",
    ]);
  });

  it("flattens callsite(a at b) to both leaves", () => {
    const op = byResult(ops, "%3");
    expect(op.locAll).toEqual(["/model.0/conv/Conv", "/model.1/act/SiLU"]);
  });

  it("drops unknown leaves inside fused locs", () => {
    const op = byResult(ops, "%4");
    expect(op.loc).toBe("/model.0/bn/BatchNorm");
    expect(op.locAll).toBeNull(); // single surviving leaf
  });

  it("parses inline fused locs without aliases", () => {
    const op = byResult(ops, "%5");
    expect(op.locAll).toEqual(["/inline.a", "/inline.b"]);
  });

  it("captures FileLineCol locs with line:col suffix", () => {
    const op = byResult(ops, "%6");
    expect(op.loc).toBe("model.py:42:8");
  });

  it("keeps loc null for pure unknown locs", () => {
    const op = byResult(ops, "%7");
    expect(op.loc).toBeNull();
    expect(op.locAll).toBeNull();
  });

  it("keeps locAll null for plain single-string locs", () => {
    const single = parseMLIR(`module {
  func.func @main() {
    %0 = arith.constant dense<1.0> : tensor<3xf32> loc("/m/a")
    util.return
  }
}`);
    const op = byResult(single, "%0");
    expect(op.loc).toBe("/m/a");
    expect(op.locAll).toBeNull();
  });

  it("back-compat locAliases map stores first leaf or unknown", () => {
    expect(ops.locAliases.get("#loc1")).toBe("/model.0/conv/Conv");
    expect(ops.locAliases.get("#loc4")).toBe("/model.0/conv/Conv");
    expect(ops.locAliases.get("#loc8")).toBe("unknown");
  });

  it("guards against alias cycles", () => {
    const cyclic = parseMLIR(`#loc1 = loc(fused[#loc2, "/a"])
#loc2 = loc(fused[#loc1, "/b"])
module {
  func.func @main() {
    %0 = arith.constant dense<1.0> : tensor<3xf32> loc(#loc1)
    util.return
  }
}`);
    const op = byResult(cyclic, "%0");
    // Cycle resolves to whatever leaves are reachable without recursion
    expect(op.loc).toBe("/b");
  });
});

const YOLO_URL = new URL(
  "../yolov8n_readable/module.10.executable-targets.mlir",
  import.meta.url
);

describe.skipIf(!existsSync(YOLO_URL))("fused locs on real IREE dump", () => {
  it("module.10 parses with ops carrying multi-leaf locAll", () => {
    const ops = parseMLIR(readFileSync(YOLO_URL, "utf8"));
    const withLocAll = ops.filter((o) => o.locAll && o.locAll.length > 1);
    expect(withLocAll.length).toBeGreaterThan(0);
  });
});
