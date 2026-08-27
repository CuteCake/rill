/**
 * Op Purpose Inference
 *
 * Thin compatibility wrapper over the profile registry. The actual
 * pattern rules (matmul, activations, bias add, ...) now live in the
 * declarative built-in profile (src/extensions/profiles/builtin-core.js)
 * and any user-loaded profiles — see docs/PROFILE_SPEC.md.
 *
 * Returns { label, icon, color } for display purposes.
 */

import { colors } from "../utils/theme.js";
import { getActiveRegistry } from "../extensions/registry.js";

/**
 * @typedef {Object} GenericInfo
 * @property {string} label - human-readable label (e.g. "matmul/MAC")
 * @property {string} icon  - short symbol for compact display
 * @property {string} color - hex color for the badge
 */

/**
 * Infer the purpose of an op from the active profiles' summarize rules.
 * @param {Object} op - a parsed op
 * @returns {GenericInfo}
 */
export function inferGenericPurpose(op) {
  return (
    getActiveRegistry().summarize(op) || {
      label: "elementwise",
      icon: "∘",
      color: colors.green,
    }
  );
}
