/**
 * Profile Validator
 *
 * Validates a user-supplied profile object (parsed JSON) against the
 * format described in docs/PROFILE_SPEC.md. Errors are written to be
 * pasted back into an AI-assisted authoring loop: each names the exact
 * path, what was wrong, and — for misspelled keys/enums — the closest
 * valid alternative ("did you mean ...?").
 */

import { MATCHER_KEYS, WHEN_KEYS } from "./matcher.js";
import { CLASSIFICATIONS } from "./registry.js";

const TOP_KEYS = ["$schema", "name", "version", "description", "dialects", "classify", "regions", "summarize", "import"];
const CLASSIFY_RULE_KEYS = ["match", "as"];
const REGION_RULE_KEYS = ["match", "policy", "captureBody"];
const SUMMARIZE_RULE_KEYS = ["match", "when", "label", "icon", "color"];
const REGION_POLICIES = ["opaque", "descend"];
const IMPORT_KEYS = ["format", "detect", "dialect", "nodes", "opName", "attrs", "collectParams", "display", "netInputs", "group"];
const IMPORT_FORMATS = ["prototxt"];
const IMPORT_DETECT_KEYS = ["extensions", "contentRegex"];
const IMPORT_NODES_KEYS = ["list", "name", "type", "inputs", "outputs", "drop"];
const IMPORT_OPNAME_KEYS = ["prefix", "map"];
const IMPORT_ATTR_KEYS = ["path", "as"];
const IMPORT_DISPLAY_KEYS = ["typeIn", "template"];
const IMPORT_GROUP_KEYS = ["delimiter", "regex"];

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const row = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = row[j];
      row[j] = Math.min(
        row[j] + 1,
        row[j - 1] + 1,
        prev + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      prev = tmp;
    }
  }
  return row[n];
}

export function didYouMean(word, candidates) {
  let best = null, bestDist = Infinity;
  for (const c of candidates) {
    const d = levenshtein(word.toLowerCase(), c.toLowerCase());
    if (d < bestDist) { bestDist = d; best = c; }
  }
  return bestDist <= Math.max(2, Math.floor(word.length / 3)) ? best : null;
}

function badKey(path, key, valid, errors) {
  const hint = didYouMean(key, valid);
  errors.push(
    `${path}: unknown key "${key}"${hint ? ` — did you mean "${hint}"?` : ""} ` +
      `(valid keys: ${valid.join(", ")})`
  );
}

export function badEnum(path, value, valid, errors) {
  const hint = typeof value === "string" ? didYouMean(value, valid) : null;
  errors.push(
    `${path}: invalid value ${JSON.stringify(value)}${hint ? ` — did you mean "${hint}"?` : ""} ` +
      `(must be one of: ${valid.join(", ")})`
  );
}

export function checkKeys(obj, valid, path, errors) {
  for (const key of Object.keys(obj)) {
    if (!valid.includes(key)) badKey(path, key, valid, errors);
  }
}

function isStringOrStringArray(v) {
  return (
    typeof v === "string" ||
    (Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === "string"))
  );
}

function checkMatcher(matcher, path, errors) {
  if (matcher === undefined) return;
  if (typeof matcher !== "object" || matcher === null || Array.isArray(matcher)) {
    errors.push(`${path}: must be an object of matcher fields`);
    return;
  }
  checkKeys(matcher, MATCHER_KEYS, path, errors);
  for (const k of ["opName", "opNameRegex", "opNameContains", "dialect", "attrHas"]) {
    if (matcher[k] !== undefined && !isStringOrStringArray(matcher[k])) {
      errors.push(`${path}.${k}: must be a string or non-empty array of strings`);
    }
  }
  for (const k of ["hasRegion", "hasResults"]) {
    if (matcher[k] !== undefined && typeof matcher[k] !== "boolean") {
      errors.push(`${path}.${k}: must be true or false`);
    }
  }
  if (matcher.opNameRegex !== undefined) {
    const patterns = Array.isArray(matcher.opNameRegex) ? matcher.opNameRegex : [matcher.opNameRegex];
    for (const p of patterns) {
      try { new RegExp(p); } catch (e) {
        errors.push(`${path}.opNameRegex: invalid regex ${JSON.stringify(p)} (${e.message})`);
      }
    }
  }
}

function checkWhen(when, path, errors) {
  if (when === undefined) return;
  if (typeof when !== "object" || when === null || Array.isArray(when)) {
    errors.push(`${path}: must be an object of condition fields`);
    return;
  }
  checkKeys(when, WHEN_KEYS, path, errors);
  for (const k of ["bodyContainsAll", "bodyContainsAny", "bodyLacksAll"]) {
    if (when[k] !== undefined && !(Array.isArray(when[k]) && when[k].every((x) => typeof x === "string"))) {
      errors.push(`${path}.${k}: must be an array of op-name strings (e.g. ["mulf", "arith.addf"])`);
    }
  }
  for (const k of ["iteratorsInclude", "iteratorsExclude"]) {
    if (when[k] !== undefined && typeof when[k] !== "string") {
      errors.push(`${path}.${k}: must be a string (e.g. "reduction")`);
    }
  }
}

function checkRuleArray(rules, path, errors, checkRule) {
  if (rules === undefined) return;
  if (!Array.isArray(rules)) {
    errors.push(`${path}: must be an array of rules`);
    return;
  }
  rules.forEach((rule, i) => {
    const rulePath = `${path}[${i}]`;
    if (typeof rule !== "object" || rule === null || Array.isArray(rule)) {
      errors.push(`${rulePath}: must be an object`);
      return;
    }
    checkRule(rule, rulePath);
  });
}

function checkRegexField(value, path, errors) {
  if (value === undefined) return;
  if (typeof value !== "string") {
    errors.push(`${path}: must be a regex string`);
    return;
  }
  try { new RegExp(value); } catch (e) {
    errors.push(`${path}: invalid regex ${JSON.stringify(value)} (${e.message})`);
  }
}

function isObject(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function checkImport(imp, path, errors) {
  if (imp === undefined) return;
  if (!isObject(imp)) {
    errors.push(`${path}: must be an object (see docs/IMPORT_SPEC.md)`);
    return;
  }
  checkKeys(imp, IMPORT_KEYS, path, errors);

  if (!IMPORT_FORMATS.includes(imp.format)) {
    badEnum(`${path}.format`, imp.format, IMPORT_FORMATS, errors);
  }
  if (typeof imp.dialect !== "string" || !imp.dialect.trim()) {
    errors.push(`${path}.dialect: required, must be a non-empty string (e.g. "caffe")`);
  }

  if (imp.detect !== undefined) {
    if (!isObject(imp.detect)) {
      errors.push(`${path}.detect: must be an object`);
    } else {
      checkKeys(imp.detect, IMPORT_DETECT_KEYS, `${path}.detect`, errors);
      if (imp.detect.extensions !== undefined && !isStringOrStringArray(imp.detect.extensions)) {
        errors.push(`${path}.detect.extensions: must be a non-empty array of extension strings (no dot, e.g. ["prototxt"])`);
      }
      checkRegexField(imp.detect.contentRegex, `${path}.detect.contentRegex`, errors);
    }
  }

  if (!isObject(imp.nodes)) {
    errors.push(`${path}.nodes: required, must be an object with list/name/type/inputs/outputs`);
  } else {
    checkKeys(imp.nodes, IMPORT_NODES_KEYS, `${path}.nodes`, errors);
    if (!isStringOrStringArray(imp.nodes.list)) {
      errors.push(`${path}.nodes.list: required, must be a field name or array of candidates (e.g. ["layer", "layers"])`);
    }
    for (const k of ["name", "type", "inputs", "outputs"]) {
      if (typeof imp.nodes[k] !== "string" || !imp.nodes[k]) {
        errors.push(`${path}.nodes.${k}: required, must be a field path string (e.g. "${k === "inputs" ? "bottom" : k === "outputs" ? "top" : k}")`);
      }
    }
    checkRuleArray(imp.nodes.drop, `${path}.nodes.drop`, errors, (rule, rulePath) => {
      checkKeys(rule, ["path", "equals"], rulePath, errors);
      if (typeof rule.path !== "string" || !rule.path) {
        errors.push(`${rulePath}.path: required, must be a field path string`);
      }
      if (rule.equals === undefined) {
        errors.push(`${rulePath}.equals: required (value to compare against)`);
      }
    });
  }

  if (imp.opName !== undefined) {
    if (!isObject(imp.opName)) {
      errors.push(`${path}.opName: must be an object`);
    } else {
      checkKeys(imp.opName, IMPORT_OPNAME_KEYS, `${path}.opName`, errors);
      if (imp.opName.prefix !== undefined && typeof imp.opName.prefix !== "string") {
        errors.push(`${path}.opName.prefix: must be a string (e.g. "caffe.")`);
      }
      if (imp.opName.map !== undefined) {
        if (!isObject(imp.opName.map)) {
          errors.push(`${path}.opName.map: must be an object mapping raw type → canonical name`);
        } else {
          for (const [k, v] of Object.entries(imp.opName.map)) {
            if (typeof v !== "string") errors.push(`${path}.opName.map.${k}: must be a string`);
          }
        }
      }
    }
  }

  checkRuleArray(imp.attrs, `${path}.attrs`, errors, (rule, rulePath) => {
    checkKeys(rule, IMPORT_ATTR_KEYS, rulePath, errors);
    if (typeof rule.path !== "string" || !rule.path) {
      errors.push(`${rulePath}.path: required, must be a field path string (e.g. "convolution_param.num_output")`);
    }
    if (rule.as !== undefined && typeof rule.as !== "string") {
      errors.push(`${rulePath}.as: must be a string`);
    }
  });

  if (imp.collectParams !== undefined && typeof imp.collectParams !== "boolean") {
    errors.push(`${path}.collectParams: must be true or false`);
  }
  if (imp.netInputs !== undefined && typeof imp.netInputs !== "boolean") {
    errors.push(`${path}.netInputs: must be true or false`);
  }

  checkRuleArray(imp.display, `${path}.display`, errors, (rule, rulePath) => {
    checkKeys(rule, IMPORT_DISPLAY_KEYS, rulePath, errors);
    if (rule.typeIn !== undefined && !isStringOrStringArray(rule.typeIn)) {
      errors.push(`${rulePath}.typeIn: must be a non-empty array of (mapped) type names`);
    }
    if (typeof rule.template !== "string" || !rule.template) {
      errors.push(`${rulePath}.template: required, must be a string with {path} placeholders`);
    }
  });

  if (imp.group !== undefined) {
    if (!isObject(imp.group)) {
      errors.push(`${path}.group: must be an object with "delimiter" or "regex"`);
    } else {
      checkKeys(imp.group, IMPORT_GROUP_KEYS, `${path}.group`, errors);
      if (imp.group.delimiter !== undefined && typeof imp.group.delimiter !== "string") {
        errors.push(`${path}.group.delimiter: must be a string (e.g. "/")`);
      }
      checkRegexField(imp.group.regex, `${path}.group.regex`, errors);
      if (imp.group.delimiter === undefined && imp.group.regex === undefined) {
        errors.push(`${path}.group: must set "delimiter" or "regex"`);
      }
    }
  }
}

/**
 * Validate a parsed profile object.
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateProfile(profile) {
  const errors = [];

  if (typeof profile !== "object" || profile === null || Array.isArray(profile)) {
    return { ok: false, errors: ["profile: must be a JSON object"] };
  }

  checkKeys(profile, TOP_KEYS, "profile", errors);

  if (typeof profile.name !== "string" || !profile.name.trim()) {
    errors.push(`profile.name: required, must be a non-empty string (e.g. "my-dialect")`);
  }
  if (profile.version !== undefined && typeof profile.version !== "number") {
    errors.push("profile.version: must be a number");
  }
  if (profile.description !== undefined && typeof profile.description !== "string") {
    errors.push("profile.description: must be a string");
  }

  if (profile.dialects !== undefined) {
    if (typeof profile.dialects !== "object" || profile.dialects === null || Array.isArray(profile.dialects)) {
      errors.push(`profile.dialects: must be an object mapping dialect name → color (e.g. { "npu": "#22d3ee" })`);
    } else {
      for (const [d, entry] of Object.entries(profile.dialects)) {
        const color = typeof entry === "string" ? entry : entry && entry.color;
        if (typeof color !== "string" || !/^#[0-9a-fA-F]{3,8}$/.test(color)) {
          errors.push(`profile.dialects.${d}: color must be a hex string like "#22d3ee"`);
        }
      }
    }
  }

  checkRuleArray(profile.classify, "profile.classify", errors, (rule, path) => {
    checkKeys(rule, CLASSIFY_RULE_KEYS, path, errors);
    checkMatcher(rule.match, `${path}.match`, errors);
    if (!CLASSIFICATIONS.includes(rule.as)) badEnum(`${path}.as`, rule.as, CLASSIFICATIONS, errors);
  });

  checkRuleArray(profile.regions, "profile.regions", errors, (rule, path) => {
    checkKeys(rule, REGION_RULE_KEYS, path, errors);
    checkMatcher(rule.match, `${path}.match`, errors);
    if (!REGION_POLICIES.includes(rule.policy)) badEnum(`${path}.policy`, rule.policy, REGION_POLICIES, errors);
    if (rule.captureBody !== undefined && typeof rule.captureBody !== "boolean") {
      errors.push(`${path}.captureBody: must be true or false`);
    }
  });

  checkImport(profile.import, "profile.import", errors);

  checkRuleArray(profile.summarize, "profile.summarize", errors, (rule, path) => {
    checkKeys(rule, SUMMARIZE_RULE_KEYS, path, errors);
    checkMatcher(rule.match, `${path}.match`, errors);
    checkWhen(rule.when, `${path}.when`, errors);
    if (typeof rule.label !== "string" || !rule.label) {
      errors.push(`${path}.label: required, must be a non-empty string`);
    }
    if (rule.color !== undefined && !/^#[0-9a-fA-F]{3,8}$/.test(rule.color)) {
      errors.push(`${path}.color: must be a hex string like "#f47316"`);
    }
  });

  return { ok: errors.length === 0, errors };
}
