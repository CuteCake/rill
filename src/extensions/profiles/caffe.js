/**
 * Built-in Caffe profile: prototxt import mapping + layer semantics.
 *
 * The actual profile lives in caffe.json — a standalone file in the exact
 * user-loadable format (docs/PROFILE_SPEC.md + docs/IMPORT_SPEC.md), so it
 * doubles as a copy-paste template for custom Caffe variants. This module
 * only re-exports it; Vite inlines the JSON into the single-file HTML
 * bundle at build time.
 */
import BUILTIN_CAFFE_PROFILE from "./caffe.json" with { type: "json" };

export { BUILTIN_CAFFE_PROFILE };
