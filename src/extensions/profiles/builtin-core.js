/**
 * Built-in core profile: linalg + arith/tensor + IREE host dialects.
 *
 * The actual profile lives in builtin-core.json — a standalone file in the
 * exact user-loadable format (docs/PROFILE_SPEC.md), so it doubles as a
 * copy-paste template for new profiles. This module only re-exports it;
 * Vite inlines the JSON into the single-file HTML bundle at build time.
 */
import BUILTIN_CORE_PROFILE from "./builtin-core.json" with { type: "json" };

export { BUILTIN_CORE_PROFILE };
