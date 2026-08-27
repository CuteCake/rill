/**
 * Profile Registry
 *
 * Composes dialect profiles (declarative rule sets, see docs/PROFILE_SPEC.md)
 * and answers the questions the parser / layout / renderer used to hardcode:
 *
 *   classify(op)      → "compute" | "aux" | "structural" | "container"
 *   regionPolicy(op)  → { policy: "opaque"|"descend", captureBody }
 *   summarize(op)     → { label, icon, color } | null
 *   dialectColor(d)   → hex color
 *
 * Profiles are consulted in order; the first matching rule wins. Each
 * query has an explain* variant that also reports which profile + rule
 * matched (or that the default was used) — this powers the profile
 * debug UI so users can iterate on generated profiles.
 *
 * A module-level "active" registry lets non-React modules (parser,
 * layout) resolve rules without threading the registry everywhere;
 * the App additionally keeps the registry in state so React re-renders
 * when a user profile is loaded.
 */

import { matchOp, matchWhen } from "./matcher.js";
import { BUILTIN_CORE_PROFILE } from "./profiles/builtin-core.js";
import { BUILTIN_CAFFE_PROFILE } from "./profiles/caffe.js";

export const CLASSIFICATIONS = ["compute", "aux", "structural", "container"];

/** Fallback palette for dialects no profile knows (stable hash pick). */
const FALLBACK_PALETTE = [
  "#5c8fef", "#34d399", "#f5bf24", "#e945a0",
  "#a78bfa", "#22d3ee", "#f47316", "#0fb8a6",
  "#a3e635", "#ef4444", "#7c9fed", "#c084fc",
];

function hashColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  }
  return FALLBACK_PALETTE[Math.abs(hash) % FALLBACK_PALETTE.length];
}

/** Accept both `dialects: { x: "#hex" }` and `dialects: { x: { color } }`. */
function dialectEntryColor(entry) {
  return typeof entry === "string" ? entry : entry && entry.color;
}

/**
 * Build a registry from an ordered list of profiles (highest priority first).
 */
export function createRegistry(profiles) {
  const dialectColorCache = new Map();

  const registry = {
    profiles,

    /** Which profile+rule classified this op, or the "compute" default. */
    explainClassify(op) {
      for (const p of profiles) {
        const rules = p.classify || [];
        for (let i = 0; i < rules.length; i++) {
          if (matchOp(rules[i].match, op)) {
            return { result: rules[i].as, profile: p.name, ruleIndex: i, rule: rules[i] };
          }
        }
      }
      return { result: "compute", profile: null, ruleIndex: -1, rule: null };
    },

    classify(op) {
      return registry.explainClassify(op).result;
    },

    /** Region handling for an op that opens a region. */
    regionPolicy(op) {
      for (const p of profiles) {
        for (const rule of p.regions || []) {
          if (matchOp(rule.match, op)) {
            return {
              policy: rule.policy || "descend",
              captureBody: Boolean(rule.captureBody),
              profile: p.name,
            };
          }
        }
      }
      return { policy: "descend", captureBody: false, profile: null };
    },

    /** Which profile+rule labeled this op, or null if none matched. */
    explainSummarize(op) {
      for (const p of profiles) {
        const rules = p.summarize || [];
        for (let i = 0; i < rules.length; i++) {
          const rule = rules[i];
          if (matchOp(rule.match, op) && matchWhen(rule.when, op)) {
            return {
              result: {
                label: rule.label,
                icon: rule.icon || "•",
                color: rule.color || registry.dialectColor(op.dialect),
              },
              profile: p.name,
              ruleIndex: i,
              rule,
            };
          }
        }
      }
      return null;
    },

    summarize(op) {
      const hit = registry.explainSummarize(op);
      return hit ? hit.result : null;
    },

    dialectColor(dialect) {
      if (dialectColorCache.has(dialect)) return dialectColorCache.get(dialect);
      let color = null;
      for (const p of profiles) {
        const entry = p.dialects && p.dialects[dialect];
        const c = dialectEntryColor(entry);
        if (c) { color = c; break; }
      }
      if (!color) color = hashColor(dialect);
      dialectColorCache.set(dialect, color);
      return color;
    },
  };

  return registry;
}

export const builtinProfiles = [BUILTIN_CORE_PROFILE, BUILTIN_CAFFE_PROFILE];

// ── Active registry singleton ──
let activeRegistry = createRegistry(builtinProfiles);

export function getActiveRegistry() {
  return activeRegistry;
}

/**
 * Install user profiles on top of the built-ins. Pass [] to reset.
 * Returns the new active registry (a fresh object, safe as a React dep).
 */
export function setUserProfiles(userProfiles) {
  activeRegistry = createRegistry([...userProfiles, ...builtinProfiles]);
  return activeRegistry;
}

/** Color for a dialect via the active registry (drop-in for theme.js's map). */
export function getDialectColor(dialect) {
  return activeRegistry.dialectColor(dialect);
}
