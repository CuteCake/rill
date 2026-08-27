/**
 * Design tokens for Rill.
 *
 * All colors, fonts, and dialect-specific styling live here so every module
 * draws from one palette.
 */

export const colors = {
  bg: "#090b10",
  panel: "#0f1219",
  border: "#1c2030",
  surface: "#13161f",
  text: "#bfc5d2",
  dim: "#4e5669",
  bright: "#e0e4ed",
  accent: "#5c8fef",
  green: "#34d399",
  yellow: "#f5bf24",
  orange: "#f47316",
  pink: "#e945a0",
  purple: "#a78bfa",
  cyan: "#22d3ee",
  red: "#ef4444",
  teal: "#0fb8a6",
  lime: "#a3e635",
};

/**
 * Dialect colors now live in profiles (see src/extensions/profiles/) and
 * resolve through the active profile registry, with a stable hash-based
 * fallback for dialects no profile knows. Re-exported here so existing
 * consumers keep importing from theme.
 */
export { getDialectColor } from "../extensions/registry.js";

export const fonts = {
  mono: "'IBM Plex Mono', 'Menlo', monospace",
  ui: "'DM Sans', system-ui, sans-serif",
};

/** Palette for location group boxes. */
const locPalette = [
  "#5c8fef", "#34d399", "#f5bf24", "#e945a0",
  "#a78bfa", "#22d3ee", "#f47316", "#0fb8a6",
  "#a3e635", "#ef4444", "#7c9fed", "#c084fc",
];

/** Get a stable color for a loc group string. */
export function getLocColor(locStr) {
  let hash = 0;
  for (let i = 0; i < locStr.length; i++) {
    hash = ((hash << 5) - hash + locStr.charCodeAt(i)) | 0;
  }
  return locPalette[Math.abs(hash) % locPalette.length];
}
