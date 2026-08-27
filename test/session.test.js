import { describe, it, expect } from "vitest";
import {
  buildSession,
  loadSession,
  isSessionObject,
  attachFiles,
} from "../src/pipeline/session.js";
import { validateSession } from "../src/pipeline/session-validate.js";
import { contentHash } from "../src/pipeline/hash.js";

const FILES = [
  { name: "module.1.input.mlir", text: "func A" },
  { name: "module.2.abi.mlir", text: "func B" },
];

function sampleSession() {
  return buildSession({
    name: "conv hunt",
    notes: "watching /model.0",
    created: "2026-07-26T00:00:00.000Z",
    snapshots: FILES.map((f) => ({ ...f, opCount: 5 })),
    probes: [
      {
        id: "p1",
        name: "conv head",
        color: "#f5bf24",
        originIndex: 0,
        keys: ["@main::l:linalg.fill|/m.0/Conv|0"],
      },
    ],
    overrides: [
      {
        pair: [0, 1],
        action: "link",
        from: ["@main::l:linalg.fill|/m.3/Sub|0"],
        to: ["@main::l:linalg.fill|/m.9/New|0"],
      },
    ],
    views: [{ name: "opening", index: 0, custom: { anything: true } }],
  });
}

describe("session build / load round-trip", () => {
  it("builds a valid session and round-trips through JSON", () => {
    const s = sampleSession();
    expect(validateSession(s).ok).toBe(true);
    const { ok, errors, session } = loadSession(JSON.stringify(s));
    expect(errors).toEqual([]);
    expect(ok).toBe(true);
    expect(session).toEqual(s);
  });

  it("round-trips views verbatim (story-mode reservation)", () => {
    const s = sampleSession();
    const { session } = loadSession(JSON.stringify(s));
    expect(session.views).toEqual([
      { name: "opening", index: 0, custom: { anything: true } },
    ]);
  });

  it("computes snapshot hashes from text when not provided", () => {
    const s = sampleSession();
    expect(s.snapshots[0].hash).toBe(contentHash("func A"));
  });

  it("rejects invalid JSON and invalid sessions with messages", () => {
    expect(loadSession("{nope").ok).toBe(false);
    const bad = { ...sampleSession(), kind: "rill-profile" };
    const res = loadSession(JSON.stringify(bad));
    expect(res.ok).toBe(false);
    expect(res.errors.join(" ")).toContain("rill-session");
  });

  it("detects session objects for open-dispatch routing", () => {
    expect(isSessionObject(sampleSession())).toBe(true);
    expect(isSessionObject({ name: "a-profile" })).toBe(false);
  });
});

describe("validateSession — checks beyond the JSON schema", () => {
  it("rejects unsupported major versions", () => {
    const s = { ...sampleSession(), version: "2.0.0" };
    const { ok, errors } = validateSession(s);
    expect(ok).toBe(false);
    expect(errors.join(" ")).toContain("major version");
  });

  it("rejects non-adjacent override pairs", () => {
    const s = sampleSession();
    s.overrides[0].pair = [0, 2];
    expect(validateSession(s).ok).toBe(false);
  });

  it("rejects link overrides with empty sides", () => {
    const s = sampleSession();
    s.overrides[0].from = [];
    expect(validateSession(s).ok).toBe(false);
  });

  it("suggests near-miss key names", () => {
    const s = sampleSession();
    s.probs = s.probes;
    delete s.probes;
    const { errors } = validateSession(s);
    expect(errors.join(" ")).toContain('did you mean "probes"');
  });
});

describe("attachFiles", () => {
  const refs = sampleSession().snapshots;

  it("matches files by exact name", () => {
    const { ordered, warnings, missing } = attachFiles(refs, FILES);
    expect(missing).toEqual([]);
    expect(warnings).toEqual([]);
    expect(ordered.map((o) => o.file.name)).toEqual(FILES.map((f) => f.name));
  });

  it("falls back to content-hash matching under a renamed file", () => {
    const renamed = [FILES[0], { name: "renamed.mlir", text: "func B" }];
    const { ordered, warnings } = attachFiles(refs, renamed);
    expect(ordered[1].file.name).toBe("renamed.mlir");
    expect(warnings.join(" ")).toContain("matched by content");
  });

  it("flags hash mismatches as stale-mapping warnings", () => {
    const edited = [FILES[0], { name: "module.2.abi.mlir", text: "func B EDITED" }];
    const { ordered, warnings } = attachFiles(refs, edited);
    expect(ordered[1].hashMismatch).toBe(true);
    expect(warnings.join(" ")).toContain("differs");
  });

  it("reports missing files but keeps session order", () => {
    const { ordered, missing } = attachFiles(refs, [FILES[1]]);
    expect(missing).toEqual(["module.1.input.mlir"]);
    expect(ordered[0].file).toBeNull();
    expect(ordered[1].file.name).toBe("module.2.abi.mlir");
  });
});
