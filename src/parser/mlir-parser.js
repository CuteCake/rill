/**
 * MLIR Parser
 *
 * Converts raw MLIR source text into a structured array of Op objects.
 *
 * Each Op has:
 *   id          - unique int
 *   line        - 1-indexed source line number
 *   raw         - original source line
 *   trimmed     - cleaned text (no trailing brace)
 *   indent      - leading whitespace count
 *   dialect     - e.g. "linalg", "arith", "tensor"
 *   opName      - full op name, e.g. "linalg.generic"
 *   results     - array of scoped SSA result names (e.g. ["%0@5", "%1@5"])
 *   rawResults  - array of original unscoped SSA names for display
 *   operands    - array of scoped SSA operand names consumed by this op
 *   types       - array of type strings, e.g. ["tensor<4x8xf32>"]
 *   attrs       - dict of parsed attributes (ins, outs, labels, name, etc.)
 *   children    - array of child op ids (for region-bearing ops)
 *   parentId    - id of enclosing region op, or null
 *   isRegion    - true if this op opens a region
 *   isCollapsible - true if this op can be collapsed in the IR explorer
 *   genericBody - for opaque-region ops with captureBody (e.g.
 *                 linalg.generic): array of body lines, or null
 *   loc         - primary loc leaf string (first leaf of fused locs), or null
 *   locAll      - all loc leaf strings when a fused/callsite loc has more
 *                 than one leaf, else null
 */

import { getActiveRegistry } from "../extensions/registry.js";

/**
 * Extract the first segment of a loc path for grouping.
 * "/model.2/cv1/conv/Conv" → "/model.2"
 */
function extractLocPrefix(locPath) {
  if (!locPath || !locPath.startsWith("/")) return locPath || "";
  const parts = locPath.split("/").filter(Boolean);
  return parts.length > 0 ? "/" + parts[0] : locPath;
}

/**
 * Parse a loc expression (the text inside `loc(...)`) into an ordered,
 * deduplicated list of leaf location strings. Grammar subset:
 *   "name"                → ["name"]
 *   "file":10:2           → ["file:10:2"]
 *   #locN                 → leaves of that alias (via resolveAlias)
 *   unknown               → []
 *   fused<meta>[a, b]     → leaves of a, then b
 *   callsite(a at b)      → leaves of a, then b
 *   "name"(child)         → ["name", ...leaves of child]   (NameLoc)
 */
function parseLocLeaves(expr, resolveAlias) {
  const out = [];
  let i = 0;

  const ws = () => {
    while (i < expr.length && (expr[i] === " " || expr[i] === "\t")) i++;
  };

  function parseString() {
    i++; // opening quote
    let s = "";
    while (i < expr.length && expr[i] !== '"') {
      if (expr[i] === "\\" && i + 1 < expr.length) {
        s += expr[i + 1];
        i += 2;
      } else {
        s += expr[i];
        i++;
      }
    }
    i++; // closing quote
    return s;
  }

  function skipAngle() {
    let depth = 0;
    while (i < expr.length) {
      const c = expr[i];
      if (c === '"') {
        parseString();
        continue;
      }
      if (c === "<") depth++;
      if (c === ">") {
        depth--;
        i++;
        if (depth === 0) return;
        continue;
      }
      i++;
    }
  }

  function parseList(close) {
    while (i < expr.length) {
      ws();
      if (expr[i] === close) {
        i++;
        return;
      }
      if (expr[i] === ",") {
        i++;
        continue;
      }
      if (expr.startsWith("at", i) && /\s/.test(expr[i + 2] || " ")) {
        i += 2;
        continue;
      }
      const before = i;
      parseOne();
      if (i === before) i++; // always make progress
    }
  }

  function parseOne() {
    ws();
    if (i >= expr.length) return;
    if (expr[i] === '"') {
      let s = parseString();
      // FileLineCol suffix: "file":line[:col]
      const m = expr.slice(i).match(/^:\d+(?::\d+)?/);
      if (m) {
        s += m[0];
        i += m[0].length;
      }
      if (s) out.push(s);
      ws();
      // NameLoc child: "name"(childLoc)
      if (expr[i] === "(") {
        i++;
        parseList(")");
      }
      return;
    }
    if (expr.startsWith("#loc", i)) {
      const m = expr.slice(i).match(/^#loc\d*/);
      i += m[0].length;
      for (const l of resolveAlias(m[0])) out.push(l);
      return;
    }
    if (expr.startsWith("unknown", i)) {
      i += 7;
      return;
    }
    if (expr.startsWith("fused", i)) {
      i += 5;
      ws();
      if (expr[i] === "<") skipAngle();
      ws();
      if (expr[i] === "[") {
        i++;
        parseList("]");
      }
      return;
    }
    if (expr.startsWith("callsite", i)) {
      i += 8;
      ws();
      if (expr[i] === "(") {
        i++;
        parseList(")");
      }
      return;
    }
    i++; // unrecognized — skip
  }

  while (i < expr.length) {
    const before = i;
    parseOne();
    if (i === before) i++;
  }

  const seen = new Set();
  const res = [];
  for (const l of out) {
    if (!l || l === "unknown" || seen.has(l)) continue;
    seen.add(l);
    res.push(l);
  }
  return res;
}

/**
 * Build a memoized, cycle-guarded resolver from alias name to leaf strings,
 * given the raw RHS text of every `#locN = loc(...)` definition.
 */
function makeAliasResolver(aliasSrc) {
  const memo = new Map();
  const inProgress = new Set();
  function resolve(alias) {
    if (memo.has(alias)) return memo.get(alias);
    const rhs = aliasSrc.get(alias);
    if (rhs == null || inProgress.has(alias)) return [];
    inProgress.add(alias);
    const leaves = parseLocLeaves(rhs, resolve);
    inProgress.delete(alias);
    memo.set(alias, leaves);
    return leaves;
  }
  return resolve;
}

/**
 * Extract the trailing loc annotation from a line as leaf strings.
 * Only a `loc(...)` whose balanced span ends the line counts (same
 * anchoring as before fused-loc support); returns [] when absent.
 */
function extractLocLeavesFromLine(text, resolveAlias) {
  let searchEnd = text.length;
  while (searchEnd > 0) {
    const k = text.lastIndexOf("loc(", searchEnd - 1);
    if (k < 0) return [];
    searchEnd = k;
    if (k > 0 && /[\w.]/.test(text[k - 1])) continue; // e.g. `myloc(`
    // Balanced-paren scan (quote-aware) from the "(" at k+3
    let depth = 0;
    let j = k + 3;
    for (; j < text.length; j++) {
      const c = text[j];
      if (c === '"') {
        j++;
        while (j < text.length && text[j] !== '"') j += text[j] === "\\" ? 2 : 1;
        continue;
      }
      if (c === "(") depth++;
      if (c === ")") {
        depth--;
        if (depth === 0) break;
      }
    }
    if (depth !== 0) continue;
    if (!/^\s*$/.test(text.slice(j + 1))) continue;
    return parseLocLeaves(text.slice(k + 4, j), resolveAlias);
  }
  return [];
}

/** Set loc, locPrefix, and locAll on a node from extracted leaves. */
function applyLocLeaves(node, leaves) {
  if (!leaves.length) return;
  node.loc = leaves[0];
  node.locPrefix = extractLocPrefix(leaves[0]);
  node.locAll = leaves.length > 1 ? leaves : null;
}

/**
 * Parse MLIR source into an array of Op objects.
 * @param {string} src - raw MLIR text
 * @returns {Array<Object>} flat array of ops with parent/child links
 *   The returned array also has a `locAliases` property (Map<string, string>).
 */
export function parseMLIR(src) {
  const lines = src.split("\n");
  const ops = [];
  let uid = 0;
  const stack = []; // stack of parent op ids

  // Pre-scan: collect #loc alias definitions as raw RHS text, then resolve
  // each to leaf strings (handles fused/callsite/alias-of-alias forms).
  const aliasSrc = new Map();
  for (const line of lines) {
    const m = line.match(/^(#loc\d*)\s*=\s*loc\((.*)\)\s*$/);
    if (m) aliasSrc.set(m[1], m[2]);
  }
  const resolveAlias = makeAliasResolver(aliasSrc);
  // Back-compat alias map: first leaf string, or "unknown"
  const locAliases = new Map();
  for (const alias of aliasSrc.keys()) {
    const leaves = resolveAlias(alias);
    locAliases.set(alias, leaves[0] || "unknown");
  }

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trimStart();
    const indent = raw.length - trimmed.length;

    // Skip blank lines and bare braces
    if (!trimmed) continue;
    if (trimmed === "{" || trimmed === "({") continue;

    // Skip attribute alias definitions (#loc0 = loc(...), #map = affine_map<...>)
    // — they are metadata, not ops
    if (trimmed[0] === "#" && /^#[\w.$]+\s*=/.test(trimmed)) continue;

    // Handle all lines starting with } — pop the region stack first
    if (trimmed.startsWith("}")) {
      const closedId = stack.pop();
      // Extract loc from closing line (e.g. "} -> tensor<...> loc(#loc100)" or loc("name"))
      // and apply to the op that opened this region
      if (closedId != null) {
        const closedOp = ops[closedId];
        if (closedOp && !closedOp.loc) {
          applyLocLeaves(closedOp, extractLocLeavesFromLine(trimmed, resolveAlias));
        }
      }
      // "} count() -> (...) {" opens a new region after closing
      if (trimmed.endsWith("{")) {
        // Create a minimal region node for the new block (e.g. count block)
        const regionNode = {
          id: uid++, line: i + 1, raw, trimmed: trimmed.slice(1).replace(/\{$/, "").trim(),
          indent, dialect: "", opName: "", results: [], rawResults: [], operands: [],
          types: [], attrs: {}, children: [],
          parentId: stack.length > 0 ? stack[stack.length - 1] : null,
          isRegion: true, isCollapsible: false, genericBody: null, loc: null, locPrefix: null,
          locAll: null, rawOperands: [],
        };
        ops.push(regionNode);
        stack.push(regionNode.id);
      }
      continue;
    }

    const node = {
      id: uid++,
      line: i + 1,
      raw,
      trimmed: trimmed.replace(/\{$/, "").trim(),
      indent,
      dialect: "",
      opName: "",
      results: [],
      rawResults: [],
      operands: [],
      types: [],
      attrs: {},
      children: [],
      parentId: stack.length > 0 ? stack[stack.length - 1] : null,
      isRegion: false,
      isCollapsible: false,
      genericBody: null,
      loc: null,
      locPrefix: null,
      locAll: null,
    };

    const opensRegion = raw.trimEnd().endsWith("{");
    parseOpLine(node, trimmed, resolveAlias);

    // Scope SSA values by parent region to avoid cross-region collisions
    node.rawResults = [...node.results];
    node.rawOperands = [...node.operands];
    if (node.parentId !== null) {
      const scope = `@${node.parentId}`;
      node.results = node.results.map((r) => r + scope);
      node.operands = node.operands.map((o) => o + scope);
    }

    if (opensRegion) {
      node.isRegion = true;
      node.isCollapsible = true;
    }

    // Link to parent
    if (node.parentId !== null) {
      const parent = ops[node.parentId];
      if (parent) parent.children.push(node.id);
    }

    // Region policy from the active profile registry:
    // "opaque" consumes the body inline (e.g. linalg.generic, tensor.pad);
    // "descend" (default) pushes the op so body ops become children.
    let opaque = false;
    if (opensRegion) {
      const rp = getActiveRegistry().regionPolicy(node);
      if (rp.policy === "opaque") {
        opaque = true;
        i = slurpOpaqueBody(node, lines, i, raw, resolveAlias, rp.captureBody);
      }
    }

    ops.push(node);

    // Push onto stack if it opens a region we haven't consumed inline
    if (opensRegion && !opaque) {
      stack.push(node.id);
    }
  }

  ops.locAliases = locAliases;
  return ops;
}

/**
 * Parse a single MLIR op line and populate the node fields.
 */
function parseOpLine(node, t, resolveAlias) {
  // Module
  if (t.startsWith("module")) {
    node.dialect = "module";
    node.opName = "module";
    return;
  }

  // Block labels
  if (t.startsWith("^")) {
    node.dialect = "block";
    node.opName = t.split("(")[0];
    return;
  }

  // SSA results: %x, %y = ...
  const ssaMatch = t.match(
    /^((?:%[\w#.$]+(?::\d+)?(?:,\s*%[\w#.$]+(?::\d+)?)*)\s*=\s*)(.*)/
  );
  if (ssaMatch) {
    const rawResults = ssaMatch[1].match(/%[\w#.$]+(?::\d+)?/g) || [];
    // Expand multi-result syntax: %name:N → %name#0, %name#1, ..., %name#(N-1)
    node.results = [];
    for (const r of rawResults) {
      const multiMatch = r.match(/^(%[\w#.$]+):(\d+)$/);
      if (multiMatch) {
        const count = parseInt(multiMatch[2], 10);
        for (let k = 0; k < count; k++) {
          node.results.push(multiMatch[1] + "#" + k);
        }
      } else {
        node.results.push(r);
      }
    }
    t = ssaMatch[2];
  }

  // Op name
  const opMatch = t.match(/^([\w]+(?:\.[\w]+)*)/);
  if (opMatch) {
    node.opName = opMatch[1];
    const dot = opMatch[1].indexOf(".");
    node.dialect = dot > 0 ? opMatch[1].substring(0, dot) : opMatch[1];
  }

  // Operands (all %values that are not results)
  const resultSet = new Set(node.results);
  node.operands = (t.match(/%[\w#.$]+(?::\d+)?/g) || []).filter(
    (v) => !resultSet.has(v)
  );

  // Types
  node.types = [
    ...new Set(
      t.match(
        /(?:tensor<[^>]+>|memref<[^>]+>|vector<[^>]+>|f16|f32|f64|bf16|i1|i8|i16|i32|i64|index|![\w.]+(?:<[^>]*>)?)/g
      ) || []
    ),
  ];

  // ins/outs attributes (linalg style)
  const insMatch = t.match(/\bins\(([^)]*)\)/);
  const outsMatch = t.match(/\bouts\(([^)]*)\)/);
  if (insMatch) node.attrs.ins = insMatch[1];
  if (outsMatch) node.attrs.outs = outsMatch[1];

  // String labels
  const strLabels = t.match(/"([^"]{1,60})"/g);
  if (strLabels && strLabels.length <= 4) {
    node.attrs.labels = strLabels.map((s) => s.replace(/"/g, ""));
  }

  // Named ops (functions, globals)
  if (/^(util\.global|util\.func|func\.func)/.test(node.opName)) {
    const nameMatch = t.match(/@([\w.$]+)/);
    if (nameMatch) node.attrs.name = "@" + nameMatch[1];
    node.attrs.vis = t.includes("public")
      ? "public"
      : t.includes("private")
        ? "private"
        : "";
  }

  // Extract loc reference: loc(#locNN) alias, direct loc("name"), or
  // fused/callsite forms (flattened to leaves; first leaf is primary)
  applyLocLeaves(node, extractLocLeavesFromLine(t, resolveAlias));
}

/**
 * Consume the body of an op whose region policy is "opaque", extracting
 * result types ("-> tensor<...>", tuple results, or "tensor<A> to tensor<B>"
 * pad-style casts) and the trailing loc from the closing line.
 * When captureBody is true, body lines and iterator types are kept on the
 * node (genericBody / attrs._iters) for summarize rules.
 * Returns the new line index.
 */
function slurpOpaqueBody(node, lines, i, raw, resolveAlias, captureBody) {
  let braces =
    (raw.match(/{/g) || []).length - (raw.match(/}/g) || []).length;
  const body = [];
  let j = i + 1;

  while (j < lines.length && braces > 0) {
    const line = lines[j];
    braces += (line.match(/{/g) || []).length;
    braces -= (line.match(/}/g) || []).length;
    if (captureBody) body.push(line.trim());

    // Pad-style result type: ": tensor<A> to tensor<B>" (target replaces)
    const castMatch = line.match(
      /:\s*(tensor<[^>]+>)\s*to\s*(tensor<[^>]+>)/
    );
    if (castMatch) {
      node.types = [castMatch[2]];
    }

    if (braces === 0) {
      // Match single result: -> tensor<...>
      // or tuple result: -> (tensor<...>, tensor<...>, ...)
      const tupleMatch = line.match(/->\s*\(([^)]+)\)/);
      if (tupleMatch) {
        const types = tupleMatch[1].match(/tensor<[^>]+>/g) || [];
        for (const t of types) {
          if (!node.types.includes(t)) node.types.push(t);
        }
      } else {
        const resultType = line.match(/->\s*(tensor<[^>]+>)/);
        if (resultType && !node.types.includes(resultType[1])) {
          node.types.push(resultType[1]);
        }
      }
      // Extract loc from closing line (e.g. "} -> tensor<...> loc(#loc100)" or loc("name"))
      if (!node.loc) {
        applyLocLeaves(node, extractLocLeavesFromLine(line, resolveAlias));
      }
    }
    j++;
  }

  if (captureBody) {
    node.genericBody = body.filter(
      (l) => l && l !== "}" && !l.startsWith("} ->")
    );

    // Parse iterator types
    const iterMatch = node.trimmed.match(
      /iterator_types\s*=\s*\[([^\]]+)\]/
    );
    node.attrs._iters = iterMatch
      ? (iterMatch[1].match(/"[^"]+"/g) || []).map((s) => s.replace(/"/g, ""))
      : [];
  }

  return j - 1;
}
