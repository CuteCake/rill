/**
 * The JSON Schema (docs/schema/profile.schema.json) is the canonical
 * definition of profile legality; validate.js is the bundled runtime
 * checker with friendlier errors. These tests keep the two from drifting:
 * every fixture in AGREEMENT_TABLE must be accepted/rejected identically
 * by both. ajv is a devDependency only — nothing here ships in the bundle.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { validateProfile } from "../src/extensions/validate.js";
import { BUILTIN_CORE_PROFILE } from "../src/extensions/profiles/builtin-core.js";
import { BUILTIN_CAFFE_PROFILE } from "../src/extensions/profiles/caffe.js";

const schema = JSON.parse(
  readFileSync("docs/schema/profile.schema.json", "utf-8")
);
const ajv = new Ajv2020({ allErrors: true, allowUnionTypes: true });
addFormats(ajv);
const ajvValidate = ajv.compile(schema);

const GOOD = {
  minimal: { name: "x" },
  fullMlir: JSON.parse(readFileSync("docs/examples/acc-accelerator.json", "utf-8")),
  builtinCore: BUILTIN_CORE_PROFILE,
  builtinCaffe: BUILTIN_CAFFE_PROFILE,
  withSchemaRef: { $schema: "./profile.schema.json", name: "x" },
  minimalImport: {
    name: "x",
    import: {
      format: "prototxt",
      dialect: "d",
      nodes: { list: "layer", name: "name", type: "type", inputs: "bottom", outputs: "top" },
    },
  },
};

const BAD = {
  missingName: { version: 1 },
  unknownTopKey: { name: "x", dialct: {} },
  badClassifyAs: { name: "x", classify: [{ match: {}, as: "computee" }] },
  badMatcherKey: { name: "x", classify: [{ match: { opNmae: "a" }, as: "aux" }] },
  badDialectColor: { name: "x", dialects: { npu: "cyan" } },
  summarizeNoLabel: { name: "x", summarize: [{ match: {}, icon: "x" }] },
  badImportFormat: {
    name: "x",
    import: {
      format: "protobuf-binary",
      dialect: "d",
      nodes: { list: "layer", name: "name", type: "type", inputs: "bottom", outputs: "top" },
    },
  },
  importMissingNodes: { name: "x", import: { format: "prototxt", dialect: "d" } },
  importMissingOutputs: {
    name: "x",
    import: {
      format: "prototxt",
      dialect: "d",
      nodes: { list: "layer", name: "name", type: "type", inputs: "bottom" },
    },
  },
  importUnknownKey: {
    name: "x",
    import: {
      format: "prototxt",
      dialect: "d",
      dilect: "d",
      nodes: { list: "layer", name: "name", type: "type", inputs: "bottom", outputs: "top" },
    },
  },
  importEmptyGroup: {
    name: "x",
    import: {
      format: "prototxt",
      dialect: "d",
      nodes: { list: "layer", name: "name", type: "type", inputs: "bottom", outputs: "top" },
      group: {},
    },
  },
  importBadDropRule: {
    name: "x",
    import: {
      format: "prototxt",
      dialect: "d",
      nodes: {
        list: "layer", name: "name", type: "type", inputs: "bottom", outputs: "top",
        drop: [{ path: "include.phase" }],
      },
    },
  },
  importBadDisplay: {
    name: "x",
    import: {
      format: "prototxt",
      dialect: "d",
      nodes: { list: "layer", name: "name", type: "type", inputs: "bottom", outputs: "top" },
      display: [{ typeIn: ["Convolution"] }],
    },
  },
};

describe("profile JSON Schema", () => {
  it("accepts the built-in and example profiles", () => {
    for (const [label, profile] of Object.entries(GOOD)) {
      const ok = ajvValidate(profile);
      expect(ok, `${label}: ${JSON.stringify(ajvValidate.errors)}`).toBe(true);
    }
  });

  it("rejects each bad fixture", () => {
    for (const [label, profile] of Object.entries(BAD)) {
      expect(ajvValidate(profile), `${label} should be rejected`).toBe(false);
    }
  });
});

describe("schema ↔ runtime validator agreement", () => {
  it("both accept every good fixture", () => {
    for (const [label, profile] of Object.entries(GOOD)) {
      const runtime = validateProfile(profile);
      expect(runtime.ok, `validateProfile(${label}): ${runtime.errors}`).toBe(true);
    }
  });

  it("both reject every bad fixture", () => {
    for (const [label, profile] of Object.entries(BAD)) {
      const runtime = validateProfile(profile);
      expect(runtime.ok, `validateProfile should reject ${label}`).toBe(false);
    }
  });
});
