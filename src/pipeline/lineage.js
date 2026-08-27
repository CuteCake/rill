/**
 * Probe lineage: given a set of tracked ops in one snapshot, chase them
 * through the cached pair MatchSets in both directions, collecting the
 * member ops per snapshot and the transformation events along the way.
 */

import { resolveKeys } from "./node-key.js";

/**
 * @param {Object} probe {originIndex, keys: [NodeKey]}
 * @param {Object} store snapshot store (getParsed / getMatches / length)
 * @returns {Array<{ids: Set<number>, events: Array}>} one entry per
 *   snapshot; events on entry i describe the i-1 → i transition for
 *   forward legs and the i → i+1 transition for backward legs.
 *   Also returns .unresolved on the array (keys that no longer resolve).
 */
export function probeLineage(probe, store) {
  const n = store.length;
  const per = Array.from({ length: n }, () => ({ ids: new Set(), events: [] }));
  const origin = store.getParsed(probe.originIndex);
  if (!origin) {
    per.unresolved = [...(probe.keys || [])];
    return per;
  }
  const { ids, unresolved } = resolveKeys(probe.keys, origin.ops);
  per.unresolved = unresolved;
  for (const id of ids) per[probe.originIndex].ids.add(id);

  // Forward: i → i+1 via fromIndex
  for (let i = probe.originIndex; i < n - 1; i++) {
    if (per[i].ids.size === 0) break;
    const ms = store.getMatches(i);
    if (!ms) break;
    const seen = new Set();
    for (const id of per[i].ids) {
      const m = ms.fromIndex.get(id);
      if (!m) {
        per[i + 1].events.push({ pair: i, kind: "removed", from: [id], to: [] });
        continue;
      }
      if (seen.has(m)) continue;
      seen.add(m);
      for (const b of m.to) per[i + 1].ids.add(b);
      if (m.kind !== "same") {
        per[i + 1].events.push({ pair: i, kind: m.kind, from: m.from, to: m.to });
      }
    }
  }

  // Backward: i → i-1 via toIndex
  for (let i = probe.originIndex; i > 0; i--) {
    if (per[i].ids.size === 0) break;
    const ms = store.getMatches(i - 1);
    if (!ms) break;
    const seen = new Set();
    for (const id of per[i].ids) {
      const m = ms.toIndex.get(id);
      if (!m) {
        per[i - 1].events.push({ pair: i - 1, kind: "added", from: [], to: [id] });
        continue;
      }
      if (seen.has(m)) continue;
      seen.add(m);
      for (const a of m.from) per[i - 1].ids.add(a);
      if (m.kind !== "same") {
        per[i - 1].events.push({ pair: i - 1, kind: m.kind, from: m.from, to: m.to });
      }
    }
  }
  return per;
}

/** Compact event trail for display: [{pair, label}] deduped and ordered. */
export function lineageTrail(per, names) {
  const trail = [];
  for (let i = 0; i < per.length; i++) {
    for (const e of per[i].events) {
      const passName = names?.[e.pair + 1] ?? `pass ${e.pair + 1}`;
      let label;
      if (e.kind === "split") label = `split 1→${e.to.length}`;
      else if (e.kind === "merged") label = `merged ${e.from.length}→1`;
      else if (e.kind === "removed") label = "eliminated";
      else if (e.kind === "added") label = "materialized";
      else label = e.kind;
      trail.push({ pair: e.pair, label: `${passName}: ${label}` });
    }
  }
  return trail;
}
