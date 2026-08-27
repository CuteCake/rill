/**
 * Bridges MatchSets to the renderer/layout when stepping the pass timeline.
 *
 * - diffSets:            per-snapshot overlay sets ("what did this pass do")
 * - translatePositions:  seed positions for reconcileLayout so surviving
 *                        nodes stay put when stepping ±1
 * - ghostNodes:          rects of eliminated ops at their previous positions
 */

/**
 * Visible-change statistics for one pass (MatchSet between two snapshots).
 * "Visible" = ops that appear in the graph (have results) or carry a symbol
 * (funcs/globals — a signature/attribute change on those is a real change).
 * Cached on the MatchSet so repeated timeline renders don't rescan.
 */
export function pairDiffStats(matchSet, prevOps, nextOps) {
  if (!matchSet) return null;
  if (matchSet._stats) return matchSet._stats;
  const vis = (ops, id) => {
    const op = ops[id];
    return !!op && (op.results.length > 0 || op.attrs?.name);
  };
  const added = matchSet.added.filter((id) => vis(nextOps, id)).length;
  const removed = matchSet.removed.filter((id) => vis(prevOps, id)).length;
  let changed = 0;
  let split = 0;
  let merged = 0;
  for (const m of matchSet.matches) {
    if (m.kind === "changed" && m.to.some((id) => vis(nextOps, id))) changed++;
    else if (m.kind === "split" && m.to.some((id) => vis(nextOps, id))) split++;
    else if (m.kind === "merged" && m.from.some((id) => vis(prevOps, id))) merged++;
  }
  const stats = {
    added,
    removed,
    changed,
    split,
    merged,
    hasDiff: added + removed + changed + split + merged > 0,
  };
  matchSet._stats = stats;
  return stats;
}

/**
 * Overlay sets for snapshot i, derived from MatchSet(i-1 ↔ i).
 * All sets contain op ids of snapshot i (the "to" side).
 */
export function diffSets(matchSet) {
  const added = new Set(matchSet?.added || []);
  const changed = new Set();
  const split = new Set();
  const merged = new Set();
  for (const m of matchSet?.matches || []) {
    for (const b of m.to) {
      if (m.kind === "changed") changed.add(b);
      else if (m.kind === "split") split.add(b);
      else if (m.kind === "merged") merged.add(b);
    }
  }
  return { added, changed, split, merged };
}

/**
 * Translate rendered positions of snapshot j through the j↔i MatchSet:
 * for each snapshot-i op that survived the pass, where was it (or its
 * source centroid) on screen in snapshot j?
 *
 * The result anchors the step: GraphView pans the camera by the median
 * anchor displacement and remaps ghosts through nearby anchors, while the
 * layout itself is always freshly computed (never position-pinned — that
 * degraded edge routing). A 1→n split anchors only its first target.
 *
 * @param {Map<number,{x,y}>} prevPosById positions of snapshot j's layout
 * @param {Object} matchSet MatchSet between the pair in pipeline order
 * @param {boolean} forward true when stepping j → j+1
 * @returns {Map<number,{x,y}>} old positions keyed by snapshot-i op ids
 */
export function translatePositions(prevPosById, matchSet, forward) {
  const prevPos = new Map();
  for (const m of matchSet?.matches || []) {
    const src = forward ? m.from : m.to;
    const dst = forward ? m.to : m.from;
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (const s of src) {
      const p = prevPosById.get(s);
      if (p) {
        sx += p.x;
        sy += p.y;
        n++;
      }
    }
    if (!n) continue;
    const seed = { x: sx / n, y: sy / n };
    if (dst.length === 1) {
      prevPos.set(dst[0], seed);
    } else {
      prevPos.set(dst[0], seed); // siblings placed by the reconciler
    }
  }
  return prevPos;
}

/** Ghost-count ceiling: a pipeline discontinuity can eliminate tens of
 *  thousands of ops at once; drawing them all as ghosts helps nobody. */
const GHOST_CAP = 1500;

/**
 * Ghost rects for ops eliminated by pass i, at their positions in the
 * previously rendered snapshot i-1 layout. Only meaningful when the user
 * stepped forward from i-1 (the Sidebar diff list covers jumps).
 */
export function ghostNodes(matchSet, prevLayout) {
  if (!matchSet || !prevLayout) return [];
  const removed = new Set(matchSet.removed);
  const ghosts = [];
  for (const p of prevLayout.nodes || []) {
    if (ghosts.length >= GHOST_CAP) break;
    if (!removed.has(p.node.id)) continue;
    ghosts.push({
      id: p.node.id,
      x: p.x,
      y: p.y,
      w: p.w,
      h: p.h,
      opName: p.node.opName,
      loc: p.node.loc,
      isAux: p.isAux,
    });
  }
  return ghosts;
}
