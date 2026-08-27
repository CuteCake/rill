/**
 * Front-end dispatch: route source text to the right parser.
 *
 * Profiles are walked in registry order (user profile first), so a user
 * profile with its own `import` section overrides the built-in Caffe
 * mapping — that is the customization path for variant formats. A file no
 * importer claims falls through to the MLIR parser, preserving the
 * original behavior for .mlir/.ir/.ll input.
 */

import { parseMLIR } from "./mlir-parser.js";
import { parsePrototxt } from "./prototxt.js";
import { applyImportMapping } from "./import-map.js";

/**
 * First profile whose `import.detect` claims this file: by extension,
 * else by content sniff (covers extensionless / .txt files).
 * @returns {Object|null} the matching profile
 */
export function detectImporter(src, fileName, profiles) {
  const ext = (fileName || "").split(".").pop().toLowerCase();
  for (const profile of profiles) {
    const detect = profile.import && profile.import.detect;
    if (!detect) continue;
    const exts = Array.isArray(detect.extensions)
      ? detect.extensions
      : detect.extensions
        ? [detect.extensions]
        : [];
    if (exts.some((e) => e.toLowerCase() === ext)) return profile;
    if (detect.contentRegex && new RegExp(detect.contentRegex, "m").test(src)) {
      return profile;
    }
  }
  return null;
}

/**
 * Parse source text with whichever front-end claims it.
 * @param {string} src - raw source text
 * @param {string} fileName - used for extension-based format detection
 * @param {Object} registry - active profile registry (user profiles first)
 * @returns {{ ops: Array<Object>, format: string, warnings: string[] }}
 */
export function parseSource(src, fileName, registry) {
  const profile = detectImporter(src, fileName, registry.profiles);
  if (profile) {
    const { root, errors } = parsePrototxt(src);
    const { ops, warnings } = applyImportMapping(root, profile.import);
    return {
      ops,
      format: profile.import.format,
      warnings: [...errors, ...warnings],
    };
  }
  return { ops: parseMLIR(src), format: "mlir", warnings: [] };
}
