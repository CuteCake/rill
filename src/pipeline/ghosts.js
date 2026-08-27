/**
 * Structural classification of removed ops, so ghosts can be drawn where
 * the removal *means* something instead of where the node used to sit.
 *
 * In a text diff, "removed" and "replaced" look the same (del + add). In a
 * graph they are different events:
 *   replaced  — an ADDED op now connects the removed op's mapped producers
 *               to its mapped consumers (A→X→B became A→Y→B)
 *   bypassed  — the mapped producer now feeds the mapped consumer directly
 *               (A→X→B became A→B; typical elision/folding)
 *   neighbor  — only one side survived (e.g. a folded constant whose
 *               consumer lives on)
 *   isolated  — no surviving mapped neighbors (a whole dead region)
 *
 * Neighbor lookups chase transitively through OTHER removed ops, so a
 * removed chain A→X1→X2→B classifies both X1 and X2 as bypassed on the
 * A→B corridor.
 */

function pushTo(map, k, v) {
  if (!map.has(k)) map.set(k, []);
  map.get(k).push(v);
}

/**
 * @param {Object} matchSet  MatchSet between prev and next snapshots
 * @param {Object} prevGraph buildGraph() of the previous snapshot
 * @param {Object} nextGraph buildGraph() of the current snapshot
 * @returns {Map<prevOpId, {kind, replacedBy?, producer?, consumer?, anchorId?, side?}>}
 */
export function classifyRemovedOps(matchSet, prevGraph, nextGraph) {
  const removed = new Set(matchSet.removed);
  const added = new Set(matchSet.added);

  const prevIn = new Map();
  const prevOut = new Map();
  for (const e of prevGraph.edges) {
    pushTo(prevOut, e.from, e.to);
    pushTo(prevIn, e.to, e.from);
  }
  const nextIn = new Map();
  const nextOut = new Map();
  for (const e of nextGraph.edges) {
    if (!nextOut.has(e.from)) nextOut.set(e.from, new Set());
    nextOut.get(e.from).add(e.to);
    if (!nextIn.has(e.to)) nextIn.set(e.to, new Set());
    nextIn.get(e.to).add(e.from);
  }

  /** Current-snapshot ids of the mapped neighbors in one direction,
   *  chasing through removed intermediates. */
  function mappedNeighbors(id, dirMap, seen) {
    const out = new Set();
    for (const n of dirMap.get(id) || []) {
      if (removed.has(n)) {
        if (seen.has(n)) continue;
        seen.add(n);
        for (const v of mappedNeighbors(n, dirMap, seen)) out.add(v);
      } else {
        const m = matchSet.fromIndex.get(n);
        if (m) for (const v of m.to) out.add(v);
      }
    }
    return out;
  }

  const result = new Map();
  for (const id of removed) {
    const producers = mappedNeighbors(id, prevIn, new Set([id]));
    const consumers = mappedNeighbors(id, prevOut, new Set([id]));

    // Replaced: an added op wired to the mapped neighbors on every side
    // the removed op actually had.
    if (producers.size || consumers.size) {
      const scores = new Map();
      for (const p of producers) {
        for (const y of nextOut.get(p) || []) {
          if (added.has(y)) scores.set(y, (scores.get(y) || 0) + 1);
        }
      }
      for (const c of consumers) {
        for (const y of nextIn.get(c) || []) {
          if (added.has(y)) scores.set(y, (scores.get(y) || 0) + 1);
        }
      }
      let best = null;
      for (const [y, score] of scores) {
        const okP =
          producers.size === 0 ||
          [...(nextIn.get(y) || [])].some((v) => producers.has(v));
        const okC =
          consumers.size === 0 ||
          [...(nextOut.get(y) || [])].some((v) => consumers.has(v));
        if (!okP || !okC) continue;
        if (!best || score > best.score || (score === best.score && y < best.y)) {
          best = { y, score };
        }
      }
      if (best) {
        result.set(id, { kind: "replaced", replacedBy: best.y });
        continue;
      }
    }

    // Bypassed: a mapped producer now feeds a mapped consumer directly
    let corridor = null;
    for (const p of producers) {
      for (const c of consumers) {
        if (nextOut.get(p)?.has(c)) {
          corridor = { p, c };
          break;
        }
      }
      if (corridor) break;
    }
    if (corridor) {
      result.set(id, { kind: "bypassed", producer: corridor.p, consumer: corridor.c });
      continue;
    }

    if (producers.size || consumers.size) {
      const side = producers.size ? "producer" : "consumer";
      result.set(id, {
        kind: "neighbor",
        anchorId: [...(producers.size ? producers : consumers)][0],
        side,
      });
      continue;
    }
    result.set(id, { kind: "isolated" });
  }
  return result;
}

/** Terse sidebar annotation for a removed op's classification. */
export function removalNote(cls, nextOps) {
  if (!cls) return undefined;
  if (cls.kind === "replaced") {
    const op = nextOps[cls.replacedBy];
    return `replaced by ${op ? op.opName : "?"}`;
  }
  if (cls.kind === "bypassed") return "folded (path shortcut)";
  return undefined;
}

const GHOST_CAP = 1500;

/**
 * Ghost seeds for the pass into the current snapshot, derived from the
 * pair MatchSet + classification — independent of HOW the user arrived,
 * so ghosts render on chip jumps too, not only adjacent steps. Structural
 * kinds (replaced/bypassed/neighbor) are placed against current-layout
 * nodes; only isolated ghosts need an old position, attached when the
 * previous snapshot's rendered layout happens to be available.
 *
 * @param {Object} matchSet pair MatchSet (prev ↔ current)
 * @param {Array}  prevOps  previous snapshot's ops
 * @param {Map}    cls      classifyRemovedOps() result
 * @param {Function} dims   (op) → {w, h, isAux} for ops with no old layout
 * @param {Object|null} prevLayout previous snapshot's rendered layout
 */
export function buildGhostSeeds(matchSet, prevOps, cls, dims, prevLayout = null) {
  const oldPos = new Map();
  if (prevLayout) {
    for (const p of prevLayout.nodes || []) oldPos.set(p.node.id, p);
  }
  const seeds = [];
  for (const id of matchSet.removed) {
    if (seeds.length >= GHOST_CAP) break;
    const op = prevOps[id];
    if (!op || op.results.length === 0) continue;
    const old = oldPos.get(id);
    const d = old ? { w: old.w, h: old.h, isAux: old.isAux } : dims(op);
    seeds.push({
      id,
      opName: op.opName,
      loc: op.loc,
      w: d.w,
      h: d.h,
      isAux: !!d.isAux,
      oldX: old ? old.x : null,
      oldY: old ? old.y : null,
      ...(cls.get(id) || { kind: "isolated" }),
    });
  }
  return seeds;
}
