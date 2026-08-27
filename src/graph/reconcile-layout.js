/**
 * Layout reconciliation for subgraph mode.
 *
 * The layered layout is global: adding or removing a single node can
 * reshuffle every layer assignment and coordinate. When the user grows a
 * subgraph trace click by click, that reshuffling is disorienting — so
 * instead of accepting the fresh layout wholesale, we reconcile it against
 * the previous node positions:
 *
 *   1. Surviving nodes are pinned at their previous positions.
 *   2. New nodes inherit a translation delta from their nearest surviving
 *      neighbors (multi-source BFS from the anchor set), so they keep the
 *      fresh layout's local arrangement while appearing next to the nodes
 *      that pulled them in.
 *   3. Overlaps are resolved by probing nearby grid slots (small horizontal
 *      displacement preferred, so layer structure is roughly preserved).
 *   4. Edge geometry is rebuilt as direct port-to-port curves with the same
 *      port-spreading rule the layout engine uses.
 *
 * Since pinned nodes can drift away from the origin, the result carries
 * x0/y0 bounding-box offsets that fit-to-view must honor.
 */

import { LAYOUT } from "./layout.js";

const COLLISION_MARGIN = 10;

function overlaps(x, y, w, h, r) {
  return (
    x < r.x + r.w + COLLISION_MARGIN &&
    x + w + COLLISION_MARGIN > r.x &&
    y < r.y + r.h + COLLISION_MARGIN &&
    y + h + COLLISION_MARGIN > r.y
  );
}

/** Rebuild edges as 2-point curves with port spreading from final positions. */
function rebuildEdges(edges, posById) {
  const valid = edges.filter((e) => posById.has(e.from) && posById.has(e.to));
  const fromMap = new Map();
  const toMap = new Map();
  for (const e of valid) {
    if (!fromMap.has(e.from)) fromMap.set(e.from, []);
    fromMap.get(e.from).push(e);
    if (!toMap.has(e.to)) toMap.set(e.to, []);
    toMap.get(e.to).push(e);
  }
  const cx = (id) => {
    const p = posById.get(id);
    return p.x + p.w / 2;
  };
  for (const list of fromMap.values()) list.sort((a, b) => cx(a.to) - cx(b.to));
  for (const list of toMap.values()) list.sort((a, b) => cx(a.from) - cx(b.from));

  return valid.map((e) => {
    const fp = posById.get(e.from);
    const tp = posById.get(e.to);
    const fList = fromMap.get(e.from);
    const tList = toMap.get(e.to);
    const fi = fList.indexOf(e);
    const ti = tList.indexOf(e);
    const fSpread = fList.length > 1 ? (fi / (fList.length - 1) - 0.5) * (fp.w * 0.6) : 0;
    const tSpread = tList.length > 1 ? (ti / (tList.length - 1) - 0.5) * (tp.w * 0.6) : 0;
    return {
      from: e.from,
      to: e.to,
      value: e.value,
      points: [
        { x: fp.x + fp.w / 2 + fSpread, y: fp.y + fp.h },
        { x: tp.x + tp.w / 2 + tSpread, y: tp.y },
      ],
      layerDist: 1,
    };
  });
}

/** Recompute loc group bounding boxes from final node positions. */
function rebuildLocGroups(groups, nodes) {
  if (!groups) return null;
  const PADS = { 0: [24, 22], 1: [16, 18], 2: [8, 14] };
  const out = [];
  for (const g of groups) {
    const members = nodes.filter((p) => {
      const loc = p.node.loc;
      if (!loc) return false;
      if (g.depth === 2) return loc === g.loc;
      return loc === g.loc || loc.startsWith(g.loc + "/");
    });
    if (!members.length) continue;
    const [pad, labelH] = PADS[g.depth];
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of members) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x + p.w);
      maxY = Math.max(maxY, p.y + p.h);
    }
    out.push({
      loc: g.loc,
      depth: g.depth,
      x: minX - pad,
      y: minY - pad - labelH,
      w: maxX - minX + pad * 2,
      h: maxY - minY + pad * 2 + labelH,
      count: members.length,
    });
  }
  return out;
}

/**
 * Reconcile a fresh layout against previous node positions.
 *
 * @param {Object} fresh   - layout from computeLayout()
 * @param {Map<number, {x: number, y: number}>|null} prevPos - previous
 *   positions keyed by op id, or null on first layout (fresh is returned)
 * @returns {Object} layout with stable positions, rebuilt edges, and
 *   x0/y0 bounding-box offsets
 */
export function reconcileLayout(fresh, prevPos) {
  if (!prevPos || !fresh.nodes.length) return fresh;

  const nodes = fresh.nodes.map((p) => ({ ...p }));
  const surviving = nodes.filter((p) => prevPos.has(p.node.id));
  if (!surviving.length) return fresh;

  // Undirected adjacency between visible nodes, from the fresh edges
  const adj = new Map();
  const addAdj = (a, b) => {
    if (!adj.has(a)) adj.set(a, []);
    adj.get(a).push(b);
  };
  for (const e of fresh.edges) {
    addAdj(e.from, e.to);
    addAdj(e.to, e.from);
  }

  // Global fallback delta (for new nodes disconnected from any survivor)
  let gdx = 0, gdy = 0;
  for (const p of surviving) {
    const prev = prevPos.get(p.node.id);
    gdx += prev.x - p.x;
    gdy += prev.y - p.y;
  }
  gdx /= surviving.length;
  gdy /= surviving.length;

  // Multi-source BFS from the surviving set: each new node inherits the
  // average delta of its already-anchored neighbors, so connected chains
  // of new nodes stay coherent relative to their anchor.
  const delta = new Map();
  const queue = [];
  for (const p of surviving) {
    const prev = prevPos.get(p.node.id);
    delta.set(p.node.id, { dx: prev.x - p.x, dy: prev.y - p.y });
    queue.push(p.node.id);
  }
  const nodeIds = new Set(nodes.map((p) => p.node.id));
  for (let qi = 0; qi < queue.length; qi++) {
    for (const nb of adj.get(queue[qi]) || []) {
      if (delta.has(nb) || !nodeIds.has(nb)) continue;
      const nbrDeltas = (adj.get(nb) || [])
        .filter((id) => delta.has(id))
        .map((id) => delta.get(id));
      const dx = nbrDeltas.reduce((s, d) => s + d.dx, 0) / nbrDeltas.length;
      const dy = nbrDeltas.reduce((s, d) => s + d.dy, 0) / nbrDeltas.length;
      delta.set(nb, { dx, dy });
      queue.push(nb);
    }
  }

  // Apply: survivors pinned exactly, new nodes translated by their delta.
  // Collect placed rects as we go for collision probing (survivors first,
  // then new nodes in BFS order so anchors are settled before dependents).
  const byId = new Map(nodes.map((p) => [p.node.id, p]));
  const placed = [];
  for (const p of surviving) {
    const prev = prevPos.get(p.node.id);
    p.x = prev.x;
    p.y = prev.y;
    placed.push(p);
  }
  const survivorIds = new Set(surviving.map((p) => p.node.id));
  const newIds = queue.filter((id) => !survivorIds.has(id));
  for (const p of nodes) {
    if (survivorIds.has(p.node.id) || delta.has(p.node.id)) continue;
    newIds.push(p.node.id); // disconnected from survivors → global delta
  }

  const stepX = LAYOUT.NODE_W + LAYOUT.GAP_X;
  const stepY = LAYOUT.NODE_H + LAYOUT.GAP_Y;
  const collides = (x, y, w, h) => placed.some((r) => overlaps(x, y, w, h, r));

  for (const id of newIds) {
    const p = byId.get(id);
    const d = delta.get(id) || { dx: gdx, dy: gdy };
    p.x += d.dx;
    p.y += d.dy;
    // Probe nearby grid slots if this spot is taken — small horizontal
    // displacement preferred so the layered look is roughly preserved.
    if (collides(p.x, p.y, p.w, p.h)) {
      probe: for (let ring = 1; ring <= 12; ring++) {
        for (let a = 0; a <= ring; a++) {
          const b = ring - a;
          for (const si of a === 0 ? [0] : [a, -a]) {
            for (const sj of b === 0 ? [0] : [b, -b]) {
              const cx = p.x + si * stepX;
              const cy = p.y + sj * stepY;
              if (!collides(cx, cy, p.w, p.h)) {
                p.x = cx;
                p.y = cy;
                break probe;
              }
            }
          }
        }
      }
    }
    placed.push(p);
  }

  // Rebuild edge geometry and loc groups from the final positions
  const posById = new Map(nodes.map((p) => [p.node.id, p]));
  const edges = rebuildEdges(fresh.edges, posById);
  const locGroups = rebuildLocGroups(fresh.locGroups, nodes);

  // Bounding box (pinned nodes can live anywhere, including negative coords)
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of nodes) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x + p.w);
    maxY = Math.max(maxY, p.y + p.h);
  }

  return {
    ...fresh,
    nodes,
    edges,
    locGroups,
    x0: minX - 20,
    y0: minY - 20,
    w: maxX - minX + 40,
    h: maxY - minY + 40,
  };
}
