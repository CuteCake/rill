/**
 * Profile Rule Matcher
 *
 * Interprets the declarative matcher objects used by dialect profiles
 * (see docs/PROFILE_SPEC.md). A matcher is a plain JSON object; every
 * field present must match (AND semantics). Array values mean "any of".
 *
 * Matcher fields (against a parsed op):
 *   opName          - exact op name, string or array of strings
 *   opNameRegex     - anchored regular expression on the op name
 *   opNameContains  - substring of the op name (loose; prefer opName)
 *   dialect         - dialect name, string or array of strings
 *   hasRegion       - boolean, op opens a region
 *   hasResults      - boolean, op produces SSA results
 *   attrHas         - attribute key that must be present in op.attrs
 *
 * `when` condition fields (against a region body, e.g. linalg.generic):
 *   bodyContainsAll  - every listed op must appear in the body
 *   bodyContainsAny  - at least one listed op must appear
 *   bodyLacksAll     - none of the listed ops may appear
 *   iteratorsInclude - iterator type that must be present (e.g. "reduction")
 *   iteratorsExclude - iterator type that must be absent
 *
 * Body ops are matched as op-name tokens ("arith.mulf"), not substrings:
 * the fragment "exp" matches "math.exp" but not "tensor.expand_shape".
 * A fragment may be a bare op name ("mulf") or fully qualified ("arith.mulf").
 */

const MATCHER_KEYS = [
  "opName",
  "opNameRegex",
  "opNameContains",
  "dialect",
  "hasRegion",
  "hasResults",
  "attrHas",
];

const WHEN_KEYS = [
  "bodyContainsAll",
  "bodyContainsAny",
  "bodyLacksAll",
  "iteratorsInclude",
  "iteratorsExclude",
];

export { MATCHER_KEYS, WHEN_KEYS };

const regexCache = new Map();
function getRegex(src) {
  let re = regexCache.get(src);
  if (!re) {
    re = new RegExp(`^(?:${src})$`);
    regexCache.set(src, re);
  }
  return re;
}

function anyOf(value, test) {
  return Array.isArray(value) ? value.some(test) : test(value);
}

/**
 * Test a matcher object against a parsed op. Empty matcher matches all.
 * @returns {boolean}
 */
export function matchOp(matcher, op) {
  if (!matcher) return true;
  if (matcher.opName !== undefined) {
    if (!anyOf(matcher.opName, (n) => op.opName === n)) return false;
  }
  if (matcher.opNameRegex !== undefined) {
    if (!anyOf(matcher.opNameRegex, (r) => getRegex(r).test(op.opName))) return false;
  }
  if (matcher.opNameContains !== undefined) {
    if (!anyOf(matcher.opNameContains, (s) => op.opName.includes(s))) return false;
  }
  if (matcher.dialect !== undefined) {
    if (!anyOf(matcher.dialect, (d) => op.dialect === d)) return false;
  }
  if (matcher.hasRegion !== undefined) {
    if (Boolean(op.isRegion) !== matcher.hasRegion) return false;
  }
  if (matcher.hasResults !== undefined) {
    if (op.results.length > 0 !== matcher.hasResults) return false;
  }
  if (matcher.attrHas !== undefined) {
    if (!anyOf(matcher.attrHas, (k) => op.attrs && op.attrs[k] !== undefined))
      return false;
  }
  return true;
}

/**
 * Extract the set of op-name tokens appearing in an op's captured region
 * body (e.g. "arith.mulf", "math.exp"). Cached on the op object.
 * @returns {Set<string>}
 */
export function getBodyOps(op) {
  if (op._bodyOps) return op._bodyOps;
  const tokens = new Set();
  for (const line of op.genericBody || []) {
    const matches = line.match(/\b[a-z_][\w]*\.[a-z_][\w.]*\b/g);
    if (matches) for (const m of matches) tokens.add(m);
  }
  op._bodyOps = tokens;
  return tokens;
}

/** True if a body op-token set contains the fragment ("mulf" or "arith.mulf"). */
function bodyHas(bodyOps, fragment) {
  if (bodyOps.has(fragment)) return true;
  const suffix = "." + fragment;
  for (const t of bodyOps) {
    if (t.endsWith(suffix)) return true;
  }
  return false;
}

/**
 * Test a `when` condition object against an op's captured body/iterators.
 * Empty condition matches all.
 * @returns {boolean}
 */
export function matchWhen(when, op) {
  if (!when) return true;
  const bodyOps = getBodyOps(op);
  const iters = (op.attrs && op.attrs._iters) || [];

  if (when.bodyContainsAll !== undefined) {
    if (!when.bodyContainsAll.every((f) => bodyHas(bodyOps, f))) return false;
  }
  if (when.bodyContainsAny !== undefined) {
    if (!when.bodyContainsAny.some((f) => bodyHas(bodyOps, f))) return false;
  }
  if (when.bodyLacksAll !== undefined) {
    if (when.bodyLacksAll.some((f) => bodyHas(bodyOps, f))) return false;
  }
  if (when.iteratorsInclude !== undefined) {
    if (!iters.includes(when.iteratorsInclude)) return false;
  }
  if (when.iteratorsExclude !== undefined) {
    if (iters.includes(when.iteratorsExclude)) return false;
  }
  return true;
}
