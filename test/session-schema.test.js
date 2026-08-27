/**
 * Keeps docs/schema/session.schema.json (canonical) and
 * src/pipeline/session-validate.js (bundled runtime checker) from
 * drifting: every fixture must be accepted/rejected identically by both.
 * Constraints only the runtime validator can express (adjacent override
 * pairs, supported major version) are tested in session.test.js instead.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { validateSession } from "../src/pipeline/session-validate.js";

const schema = JSON.parse(
  readFileSync("docs/schema/session.schema.json", "utf-8")
);
const ajv = new Ajv2020({ allErrors: true, allowUnionTypes: true });
addFormats(ajv);
const ajvValidate = ajv.compile(schema);

const MINIMAL = {
  kind: "rill-session",
  version: "1.0.0",
  snapshots: [{ file: "a.mlir", hash: "fnv1a64:0011223344556677" }],
};

const FULL = {
  $schema: "./session.schema.json",
  kind: "rill-session",
  version: "1.2.3",
  name: "yolo conv hunt",
  created: "2026-07-26T00:00:00.000Z",
  notes: "free text",
  snapshots: [
    { file: "module.1.input.mlir", hash: "fnv1a64:aa", opCount: 2600 },
    { file: "module.2.abi.mlir", hash: "fnv1a64:bb" },
  ],
  probes: [
    {
      id: "p1",
      name: "conv head",
      color: "#f5bf24",
      originIndex: 0,
      keys: ["@main::l:linalg.fill|/m.0/Conv|0"],
      notes: "",
    },
  ],
  overrides: [
    { pair: [4, 5], action: "link", from: ["k1"], to: ["k2", "k3"] },
  ],
  views: [
    { name: "opening", index: 0, probes: [], camera: {}, notes: "", extra: 1 },
  ],
};

const GOOD = { MINIMAL, FULL };

const BAD = {
  missingSnapshots: { kind: "rill-session", version: "1.0.0" },
  emptySnapshots: { kind: "rill-session", version: "1.0.0", snapshots: [] },
  wrongKind: { ...MINIMAL, kind: "rill-profile" },
  badVersion: { ...MINIMAL, version: "1.0" },
  unknownTopKey: { ...MINIMAL, probs: [] },
  snapshotMissingHash: {
    kind: "rill-session",
    version: "1.0.0",
    snapshots: [{ file: "a.mlir" }],
  },
  probeEmptyKeys: {
    ...MINIMAL,
    probes: [{ id: "p", originIndex: 0, keys: [] }],
  },
  overrideBadAction: {
    ...MINIMAL,
    overrides: [{ pair: [0, 1], action: "merge", from: ["k"], to: ["k"] }],
  },
  viewsNotArray: { ...MINIMAL, views: {} },
  viewItemNotObject: { ...MINIMAL, views: ["a string"] },
};

describe("session schema ↔ runtime validator agreement", () => {
  for (const [name, fixture] of Object.entries(GOOD)) {
    it(`both accept ${name}`, () => {
      expect(validateSession(fixture).errors).toEqual([]);
      const ok = ajvValidate(fixture);
      expect(ajvValidate.errors ?? []).toEqual([]);
      expect(ok).toBe(true);
    });
  }
  for (const [name, fixture] of Object.entries(BAD)) {
    it(`both reject ${name}`, () => {
      expect(validateSession(fixture).ok).toBe(false);
      expect(ajvValidate(fixture)).toBe(false);
    });
  }
});
