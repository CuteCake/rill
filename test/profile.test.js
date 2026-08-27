import { describe, it, expect, afterEach } from "vitest";
import { matchOp, matchWhen, getBodyOps } from "../src/extensions/matcher.js";
import {
  createRegistry,
  builtinProfiles,
  getActiveRegistry,
  setUserProfiles,
} from "../src/extensions/registry.js";
import { validateProfile } from "../src/extensions/validate.js";
import { BUILTIN_CORE_PROFILE } from "../src/extensions/profiles/builtin-core.js";
import { parseMLIR } from "../src/parser/mlir-parser.js";
import { isStructuralOp, isAuxiliaryOp } from "../src/graph/layout.js";

function op(overrides = {}) {
  return {
    id: 0,
    opName: "arith.addf",
    dialect: "arith",
    results: ["%0"],
    operands: [],
    attrs: {},
    isRegion: false,
    genericBody: null,
    ...overrides,
  };
}

describe("matchOp", () => {
  it("matches exact opName, arrays as any-of", () => {
    expect(matchOp({ opName: "arith.addf" }, op())).toBe(true);
    expect(matchOp({ opName: "arith.mulf" }, op())).toBe(false);
    expect(matchOp({ opName: ["arith.mulf", "arith.addf"] }, op())).toBe(true);
  });

  it("anchors opNameRegex", () => {
    expect(matchOp({ opNameRegex: "arith\\..*" }, op())).toBe(true);
    expect(matchOp({ opNameRegex: "addf" }, op())).toBe(false); // not full match
  });

  it("matches dialect, hasRegion, hasResults, attrHas", () => {
    expect(matchOp({ dialect: "arith" }, op())).toBe(true);
    expect(matchOp({ dialect: "linalg" }, op())).toBe(false);
    expect(matchOp({ hasRegion: true }, op())).toBe(false);
    expect(matchOp({ hasResults: true }, op())).toBe(true);
    expect(matchOp({ hasResults: false }, op({ results: [] }))).toBe(true);
    expect(matchOp({ attrHas: "ins" }, op({ attrs: { ins: "%a" } }))).toBe(true);
    expect(matchOp({ attrHas: "ins" }, op())).toBe(false);
  });

  it("empty matcher matches everything", () => {
    expect(matchOp({}, op())).toBe(true);
    expect(matchOp(undefined, op())).toBe(true);
  });
});

describe("matchWhen (body conditions)", () => {
  const generic = op({
    opName: "linalg.generic",
    dialect: "linalg",
    genericBody: [
      "^bb0(%in: f32, %out: f32):",
      "%8 = math.exp %in : f32",
      "%9 = tensor.expand_shape %x [[0, 1]] : tensor<4xf32> into tensor<1x4xf32>",
      "linalg.yield %8 : f32",
    ],
    attrs: { _iters: ["parallel", "parallel"] },
  });

  it("matches op-name tokens, not substrings", () => {
    expect(getBodyOps(generic).has("math.exp")).toBe(true);
    expect(matchWhen({ bodyContainsAll: ["exp"] }, generic)).toBe(true);
    // "expand_shape" contains "exp" as substring but is a different op token
    expect(matchWhen({ bodyContainsAll: ["expa"] }, generic)).toBe(false);
    expect(matchWhen({ bodyContainsAll: ["expand_shape"] }, generic)).toBe(true);
    expect(matchWhen({ bodyContainsAll: ["math.exp"] }, generic)).toBe(true);
    expect(matchWhen({ bodyContainsAll: ["arith.exp"] }, generic)).toBe(false);
  });

  it("supports any/lacks/iterator conditions", () => {
    expect(matchWhen({ bodyContainsAny: ["mulf", "exp"] }, generic)).toBe(true);
    expect(matchWhen({ bodyLacksAll: ["mulf"] }, generic)).toBe(true);
    expect(matchWhen({ bodyLacksAll: ["exp"] }, generic)).toBe(false);
    expect(matchWhen({ iteratorsInclude: "reduction" }, generic)).toBe(false);
    expect(matchWhen({ iteratorsExclude: "reduction" }, generic)).toBe(true);
  });
});

describe("registry classification (builtin parity)", () => {
  const reg = createRegistry(builtinProfiles);

  it("classifies structural ops", () => {
    for (const o of [
      op({ opName: "module", dialect: "module" }),
      op({ opName: "func.func", dialect: "func" }),
      op({ opName: "util.return", dialect: "util" }),
      op({ opName: "util.global", dialect: "util" }),
      op({ opName: "hal.tensor.import", dialect: "hal" }),
      op({ opName: "^bb0", dialect: "block" }),
    ]) {
      expect(reg.classify(o)).toBe("structural");
    }
  });

  it("classifies aux ops", () => {
    expect(reg.classify(op({ opName: "arith.constant" }))).toBe("aux");
    expect(reg.classify(op({ opName: "tensor.empty", dialect: "tensor" }))).toBe("aux");
  });

  it("defaults to compute with null provenance", () => {
    const o = op({ opName: "mydialect.thing", dialect: "mydialect" });
    const hit = reg.explainClassify(o);
    expect(hit.result).toBe("compute");
    expect(hit.profile).toBe(null);
  });

  it("reports provenance for rule hits", () => {
    const hit = reg.explainClassify(op({ opName: "arith.constant" }));
    expect(hit.profile).toBe("builtin-core");
    expect(hit.ruleIndex).toBeGreaterThanOrEqual(0);
  });

  it("resolves dialect colors with stable hash fallback", () => {
    expect(reg.dialectColor("linalg")).toBe("#e945a0");
    const c1 = reg.dialectColor("mydialect");
    expect(c1).toMatch(/^#[0-9a-f]{6}$/i);
    expect(reg.dialectColor("mydialect")).toBe(c1);
  });
});

describe("user profile stacking", () => {
  afterEach(() => setUserProfiles([]));

  const userProfile = {
    name: "test-npu",
    dialects: { npu: "#123456" },
    classify: [
      { match: { opName: "npu.dma" }, as: "aux" },
      // Override a builtin: re-show hal ops as compute
      { match: { dialect: "hal" }, as: "compute" },
    ],
    summarize: [
      { match: { opName: "npu.kernel" }, label: "kernel", icon: "▣", color: "#123456" },
    ],
  };

  it("user rules win over builtins and defaults", () => {
    const reg = setUserProfiles([userProfile]);
    expect(reg.classify(op({ opName: "npu.dma", dialect: "npu" }))).toBe("aux");
    expect(reg.classify(op({ opName: "hal.tensor.import", dialect: "hal" }))).toBe("compute");
    expect(reg.dialectColor("npu")).toBe("#123456");
    expect(reg.summarize(op({ opName: "npu.kernel", dialect: "npu" })).label).toBe("kernel");
    // builtin rules still apply where user profile is silent
    expect(reg.classify(op({ opName: "arith.constant" }))).toBe("aux");
  });

  it("layout helpers follow the active registry", () => {
    setUserProfiles([userProfile]);
    expect(isAuxiliaryOp(op({ opName: "npu.dma", dialect: "npu" }))).toBe(true);
    expect(isStructuralOp(op({ opName: "hal.tensor.import", dialect: "hal" }))).toBe(false);
    setUserProfiles([]);
    expect(isStructuralOp(op({ opName: "hal.tensor.import", dialect: "hal" }))).toBe(true);
  });
});

describe("region policy through the parser", () => {
  afterEach(() => setUserProfiles([]));

  const SRC = [
    "module {",
    "  func.func @main() {",
    "    %0 = mydialect.kernel {",
    "      %1 = arith.mulf %a, %b : f32",
    "      mydialect.yield %1 : f32",
    "    } -> tensor<4xf32>",
    "    return",
    "  }",
    "}",
  ].join("\n");

  it("descends into unknown regions by default", () => {
    const ops = parseMLIR(SRC);
    const kernel = ops.find((o) => o.opName === "mydialect.kernel");
    expect(kernel.genericBody).toBe(null);
    expect(ops.some((o) => o.opName === "arith.mulf")).toBe(true);
    expect(ops.find((o) => o.opName === "arith.mulf").parentId).toBe(kernel.id);
  });

  it("treats regions as opaque when a profile says so", () => {
    setUserProfiles([
      {
        name: "test-opaque",
        regions: [{ match: { opName: "mydialect.kernel" }, policy: "opaque", captureBody: true }],
      },
    ]);
    const ops = parseMLIR(SRC);
    const kernel = ops.find((o) => o.opName === "mydialect.kernel");
    expect(ops.some((o) => o.opName === "arith.mulf")).toBe(false);
    expect(kernel.genericBody.join(" ")).toContain("arith.mulf");
    expect(kernel.types).toContain("tensor<4xf32>");
  });
});

describe("validateProfile", () => {
  it("accepts the builtin profile (dogfooding)", () => {
    const { ok, errors } = validateProfile(BUILTIN_CORE_PROFILE);
    expect(errors).toEqual([]);
    expect(ok).toBe(true);
  });

  it("requires a name", () => {
    const { ok, errors } = validateProfile({});
    expect(ok).toBe(false);
    expect(errors.join(" ")).toContain("profile.name");
  });

  it("suggests corrections for misspelled keys and enums", () => {
    const { errors } = validateProfile({
      name: "x",
      clasify: [],
      classify: [{ match: { opNmae: "a.b" }, as: "structual" }],
    });
    const all = errors.join("\n");
    expect(all).toContain('did you mean "classify"?');
    expect(all).toContain('did you mean "opName"?');
    expect(all).toContain('did you mean "structural"?');
  });

  it("rejects invalid regex and colors with exact paths", () => {
    const { errors } = validateProfile({
      name: "x",
      dialects: { npu: "blue" },
      classify: [{ match: { opNameRegex: "(" }, as: "aux" }],
    });
    const all = errors.join("\n");
    expect(all).toContain("profile.dialects.npu");
    expect(all).toContain("profile.classify[0].match.opNameRegex");
  });

  it("validates summarize rules", () => {
    const { errors } = validateProfile({
      name: "x",
      summarize: [{ match: { opName: "a.b" }, when: { bodyContansAll: ["x"] } }],
    });
    const all = errors.join("\n");
    expect(all).toContain('did you mean "bodyContainsAll"?');
    expect(all).toContain("label");
  });

  it("validates import sections with did-you-mean hints", () => {
    const { ok, errors } = validateProfile({
      name: "x",
      import: {
        format: "prototext",
        dialct: "caffe",
        nodes: { list: "layer", name: "name", type: "type", inputs: "bottom" },
      },
    });
    expect(ok).toBe(false);
    const all = errors.join("\n");
    expect(all).toContain('did you mean "prototxt"?');
    expect(all).toContain('did you mean "dialect"?');
    expect(all).toContain("profile.import.nodes.outputs");
  });

  it("rejects invalid import regexes and rule shapes", () => {
    const { errors } = validateProfile({
      name: "x",
      import: {
        format: "prototxt",
        dialect: "caffe",
        detect: { contentRegex: "(" },
        nodes: {
          list: ["layer"], name: "name", type: "type", inputs: "bottom", outputs: "top",
          drop: [{ path: "include.phase" }],
        },
        display: [{ typeIn: ["Convolution"] }],
        group: {},
      },
    });
    const all = errors.join("\n");
    expect(all).toContain("profile.import.detect.contentRegex");
    expect(all).toContain("profile.import.nodes.drop[0].equals");
    expect(all).toContain("profile.import.display[0].template");
    expect(all).toContain("profile.import.group");
  });
});

describe("active registry singleton", () => {
  it("getActiveRegistry returns builtins by default", () => {
    expect(getActiveRegistry().profiles.map((p) => p.name)).toContain("builtin-core");
  });
});
