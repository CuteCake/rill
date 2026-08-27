/**
 * Declarative Import Mapping
 *
 * Maps a parsed protobuf-text message tree (src/parser/prototxt.js) onto
 * the op-array contract the rest of the pipeline consumes, driven entirely
 * by a profile's `import` section (see docs/IMPORT_SPEC.md). Variants of
 * Caffe prototxt differ only in field names, list names, enum types and
 * param blocks — all of which are config here, not code.
 *
 * Invariants of the op contract are enforced in code and are NOT
 * configurable: value-name uniqueness (in-place layers get versioned
 * "blob@k" results while rawResults keep the plain name, mirroring the
 * MLIR parser's "@parentId" scoping), sink-result synthesis for
 * zero-output layers (ops without results are never drawn), and id ===
 * array index.
 */

import { getAll, getFirst, getValues } from "./prototxt.js";

const PLACEHOLDER_RE = /\{([\w.]+)(\*)?\}/g;

function asStr(v) {
  return v === undefined || v === null ? undefined : String(v);
}

/**
 * Render a display template against a layer message. Placeholders:
 * {path} → first value at path; {path*} → all values joined with "×".
 * Returns null if any placeholder resolves to nothing (rule is skipped).
 */
function renderTemplate(template, layer) {
  let ok = true;
  const out = template.replace(PLACEHOLDER_RE, (_, path, star) => {
    if (star) {
      const vals = getValues(layer, path);
      if (vals.length === 0) ok = false;
      return vals.join("×");
    }
    const v = getFirst(layer, path);
    if (v === undefined || typeof v === "object") ok = false;
    return String(v);
  });
  return ok ? out : null;
}

/** Hoist scalar leaves of a param message into attrs (recursive). */
function hoistParams(msg, attrs) {
  for (const key of Object.keys(msg)) {
    const entries = msg[key];
    if (entries.some((e) => e.m !== undefined)) {
      for (const e of entries) if (e.m !== undefined) hoistParams(e.m, attrs);
      continue;
    }
    if (!(key in attrs)) {
      const vals = entries.map((e) => e.v);
      attrs[key] = vals.length === 1 ? vals[0] : vals;
    }
  }
}

function formatAttrsSummary(attrs) {
  const parts = [];
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "name") continue;
    parts.push(`${k}=${Array.isArray(v) ? v.join(",") : v}`);
    if (parts.length >= 6) break;
  }
  return parts.join(" ");
}

/** Blank op skeleton satisfying every field downstream modules read. */
function baseOp(line) {
  return {
    id: -1, // assigned after all ops are collected (id === array index)
    line,
    raw: "",
    trimmed: "",
    indent: 0,
    dialect: "",
    opName: "",
    results: [],
    rawResults: [],
    operands: [],
    rawOperands: [],
    types: [],
    attrs: {},
    children: [],
    parentId: null,
    isRegion: false,
    isCollapsible: false,
    genericBody: null,
    paramLines: null, // full attr list, one "key = value" line each —
    //                   cross-pass change detection and the node diff read
    //                   this (op.trimmed only carries a capped summary)
    loc: null,
    locPrefix: null,
  };
}

/** All attrs (except the identity `name`) as one deterministic line each. */
function buildParamLines(attrs) {
  const lines = [];
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "name") continue;
    lines.push(`${k} = ${Array.isArray(v) ? v.join(",") : v}`);
  }
  return lines.length ? lines : null;
}

/**
 * Apply a profile's `import` section to a parsed prototxt tree.
 * @param {Object} root - message tree from parsePrototxt
 * @param {Object} cfg - the profile's validated `import` section
 * @returns {{ ops: Array<Object>, warnings: string[] }}
 */
export function applyImportMapping(root, cfg) {
  const warnings = [];
  const ops = [];
  const dialect = cfg.dialect;
  const prefix = (cfg.opName && cfg.opName.prefix) || dialect + ".";
  const typeMap = (cfg.opName && cfg.opName.map) || {};
  const displayRules = cfg.display || [];
  const collectParams = cfg.collectParams !== false;

  // Value-name versioning state (the in-place / redefinition guard)
  const defCount = new Map(); // plain blob name → times defined
  const current = new Map(); // plain blob name → currently active (versioned) name

  function defineBlob(plain) {
    const count = defCount.get(plain) || 0;
    const name = count === 0 ? plain : `${plain}@${count}`;
    defCount.set(plain, count + 1);
    current.set(plain, name);
    return name;
  }

  // ── Synthetic input ops from top-level input declarations ──
  if (cfg.netInputs !== false) {
    const inputEntries = getAll(root, "input");
    const shapeEntries = getAll(root, "input_shape");
    const flatDims = getValues(root, "input_dim");
    inputEntries.forEach((entry, idx) => {
      const blob = asStr(entry.v);
      if (!blob) return;
      const op = baseOp(entry.line);
      op.dialect = dialect;
      op.opName = prefix + "input";
      op.attrs.name = blob;
      const versioned = defineBlob(blob);
      op.results = [versioned];
      op.rawResults = [blob];
      let dims = [];
      if (shapeEntries[idx] && shapeEntries[idx].m) {
        dims = getValues(shapeEntries[idx].m, "dim");
      } else if (flatDims.length >= (idx + 1) * 4) {
        dims = flatDims.slice(idx * 4, idx * 4 + 4);
      }
      if (dims.length > 0) op.types = [dims.join("×")];
      op.trimmed = op.raw = `${blob} = ${op.opName}${
        dims.length ? "  " + dims.join("×") : ""
      }`;
      ops.push(op);
    });
  }

  // ── Layer list: first configured field name that has entries wins ──
  const listNames = Array.isArray(cfg.nodes.list) ? cfg.nodes.list : [cfg.nodes.list];
  let layerEntries = [];
  for (const name of listNames) {
    const entries = getAll(root, name).filter((e) => e.m !== undefined);
    if (entries.length > 0) {
      layerEntries = entries;
      break;
    }
  }
  if (layerEntries.length === 0 && ops.length === 0) {
    warnings.push(
      `no node list found (looked for: ${listNames.join(", ")})`
    );
  }

  for (const entry of layerEntries) {
    const layer = entry.m;

    // Drop rules (e.g. TEST-phase layers)
    if (
      (cfg.nodes.drop || []).some(
        (rule) => asStr(getFirst(layer, rule.path)) === asStr(rule.equals)
      )
    ) {
      continue;
    }

    const op = baseOp(layer.__line || entry.line);
    op.dialect = dialect;

    const name = asStr(getFirst(layer, cfg.nodes.name)) || `layer${ops.length}`;
    op.attrs.name = name;

    const rawType = asStr(getFirst(layer, cfg.nodes.type)) || "Unknown";
    const mappedType = typeMap[rawType] || rawType;
    op.opName = prefix + mappedType;

    // Operands first (so in-place layers consume the PREVIOUS version)
    const bottoms = getValues(layer, cfg.nodes.inputs).map(asStr);
    op.rawOperands = [...bottoms];
    op.operands = bottoms.map((b) => current.get(b) || b);

    // Results, versioning redefinitions
    const tops = getValues(layer, cfg.nodes.outputs).map(asStr);
    op.rawResults = [...tops];
    for (const top of tops) {
      const before = defCount.get(top) || 0;
      op.results.push(defineBlob(top));
      if (before > 0 && !bottoms.includes(top)) {
        warnings.push(
          `blob "${top}" redefined by layer "${name}" (line ${op.line}) — versioned`
        );
      }
    }
    if (tops.length === 0) {
      // Sink layers (no outputs) still need a result to be drawn
      op.results = [`${name}!out`];
      op.rawResults = [];
    }

    // Attrs: explicit extractions win over auto-collected params
    for (const spec of cfg.attrs || []) {
      const v = getFirst(layer, spec.path);
      if (v !== undefined && typeof v !== "object") {
        op.attrs[spec.as || spec.path.split(".").pop()] = v;
      }
    }
    if (collectParams) {
      for (const key of Object.keys(layer)) {
        if (!key.endsWith("_param")) continue;
        for (const e of layer[key]) {
          if (e.m !== undefined) hoistParams(e.m, op.attrs);
        }
      }
    }

    // Display template → op.types (renderer draws types[last] on the node)
    for (const rule of displayRules) {
      if (rule.typeIn && !rule.typeIn.includes(mappedType)) continue;
      const rendered = renderTemplate(rule.template, layer);
      if (rendered !== null) {
        op.types = [rendered];
        break;
      }
    }

    // Grouping from the layer name (feeds loc-group boxes + sidebar)
    if (cfg.group) {
      let groupPrefix = null;
      if (cfg.group.regex) {
        const m = name.match(new RegExp(cfg.group.regex));
        if (m && m[1]) groupPrefix = m[1];
      } else if (cfg.group.delimiter && name.includes(cfg.group.delimiter)) {
        groupPrefix = name.split(cfg.group.delimiter)[0];
      }
      if (groupPrefix) {
        op.loc = name;
        op.locPrefix = groupPrefix;
      }
    }

    const summary = formatAttrsSummary(op.attrs);
    op.trimmed = op.raw = `${tops.join(", ") || name} = ${op.opName}(${bottoms.join(
      ", "
    )})${summary ? "  " + summary : ""}`;
    op.paramLines = buildParamLines(op.attrs);

    ops.push(op);
  }

  // Prefixes shared by fewer than 2 ops don't form a group box
  const prefixCounts = new Map();
  for (const op of ops) {
    if (op.locPrefix) {
      prefixCounts.set(op.locPrefix, (prefixCounts.get(op.locPrefix) || 0) + 1);
    }
  }
  for (const op of ops) {
    if (op.locPrefix && prefixCounts.get(op.locPrefix) < 2) {
      op.loc = null;
      op.locPrefix = null;
    }
  }

  ops.forEach((op, i) => {
    op.id = i;
  });
  return { ops, warnings };
}
