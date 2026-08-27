/**
 * Graph Layout Engine
 *
 * Computes a layered DAG layout for the MLIR dataflow graph. Key features:
 *
 * 1. Structural op filtering — ops classified "structural" by the active
 *    profile registry (module, block, func, return, hal, ...) are completely
 *    hidden. Ops classified "aux" (constants, empties, broadcasts, etc.)
 *    are shown as smaller "mini" nodes.
 *
 * 2. Longest-path layering via Kahn's algorithm — places ops in layers
 *    such that all dependencies flow top-to-bottom.
 *
 * 3. Dummy nodes for long edges — edges spanning multiple layers are split
 *    into chains through dummy nodes, which participate in crossing
 *    reduction and positioning for smooth edge routing.
 *
 * 4. Barycenter heuristic — reorders nodes within each layer to minimize
 *    edge crossings (up to 24 bidirectional passes with early exit).
 *
 * 5. Brandes–Köpf coordinate assignment — four extreme alignments
 *    (up/down × left/right) chain nodes to their median neighbours into
 *    vertical blocks, blocks are compacted, and the per-node median of
 *    the four candidates gives balanced, drift-free coordinates with
 *    straight vertical chains. With loc grouping on, extra horizontal
 *    gaps separate different loc groups within each layer.
 *
 * 6. Port spreading — when multiple edges share a source or target, their
 *    attachment points are spread across the node width.
 *
 * Returns a layout object with positioned nodes and waypoint-based edges.
 */

import { getActiveRegistry } from "../extensions/registry.js";

/**
 * Returns true if an op is structural and should always be hidden.
 * Classification is resolved by the active profile registry.
 */
export function isStructuralOp(op) {
  return getActiveRegistry().classify(op) === "structural";
}

/**
 * Returns true if an op is auxiliary (constant, empty, broadcast, etc.).
 */
export function isAuxiliaryOp(op) {
  return getActiveRegistry().classify(op) === "aux";
}

/** Default node dimensions and spacing. */
export const LAYOUT = {
  NODE_W: 190,
  NODE_H: 50,
  AUX_W: 110,
  AUX_H: 28,
  DUMMY_W: 2,
  GAP_X: 60,
  GAP_Y: 48,
};

/**
 * Compute a full positioned graph layout.
 *
 * @param {Array<Object>} ops      - parsed ops from parseMLIR()
 * @param {Object}        graph    - from buildGraph()
 * @param {boolean}       showAux  - if true, aux ops appear as mini nodes
 * @param {boolean}       locGrouping - if true, group nodes by location
 * @returns {{ nodes: Array, edges: Array, w: number, h: number }}
 */
export function computeLayout(ops, graph, showAux = true, locGrouping = false) {
  const { NODE_W: NW, NODE_H: NH, AUX_H: AH, DUMMY_W: DW, GAP_X: GX, GAP_Y: GY } = LAYOUT;

  // ── Step 1: Filter ops ──
  const opsById = new Map(ops.map((o) => [o.id, o]));

  const visibleOps = ops.filter((n) => {
    if (n.results.length === 0) return false;
    if (isStructuralOp(n)) return false;
    if (!showAux && isAuxiliaryOp(n)) return false;
    if (n.parentId !== null) {
      const parent = opsById.get(n.parentId);
      if (parent && !isStructuralOp(parent)) return false;
    }
    return true;
  });

  if (!visibleOps.length) {
    return { nodes: [], edges: [], w: 0, h: 0, NW, NH, GY, locGroups: null };
  }
  const idSet = new Set(visibleOps.map((n) => n.id));

  // ── Step 2: Build edges ──
  const visibleEdges = [];
  const edgeSet = new Set();

  for (const n of visibleOps) {
    const visited = new Set();
    const queue = [...n.operands];

    while (queue.length) {
      const val = queue.shift();
      if (visited.has(val)) continue;
      visited.add(val);

      const defId = graph.defs[val];
      if (defId === undefined || defId === n.id) continue;

      if (idSet.has(defId)) {
        const key = `${defId}->${n.id}`;
        if (!edgeSet.has(key)) {
          edgeSet.add(key);
          visibleEdges.push({ from: defId, to: n.id, value: val });
        }
      } else {
        const defOp = opsById.get(defId);
        if (defOp) {
          for (const op of defOp.operands) queue.push(op);
        }
      }
    }
  }

  // ── Step 2b: Remove disconnected ops (no edges at all) ──
  const connectedIds = new Set();
  for (const e of visibleEdges) {
    connectedIds.add(e.from);
    connectedIds.add(e.to);
  }
  const connectedOps = visibleOps.filter((n) => connectedIds.has(n.id));
  if (!connectedOps.length) {
    return { nodes: [], edges: [], w: 0, h: 0, NW, NH, GY, locGroups: null };
  }

  // ── Step 3: Kahn's algorithm — longest-path layering ──
  const adj = {};
  const inDeg = {};
  for (const n of connectedOps) {
    adj[n.id] = [];
    inDeg[n.id] = 0;
  }
  for (const e of visibleEdges) {
    adj[e.from].push(e.to);
    inDeg[e.to] = (inDeg[e.to] || 0) + 1;
  }

  const layer = {};
  const queue = [];
  for (const n of connectedOps) {
    if ((inDeg[n.id] || 0) === 0) {
      queue.push(n.id);
      layer[n.id] = 0;
    }
  }
  while (queue.length) {
    const cur = queue.shift();
    for (const child of adj[cur]) {
      layer[child] = Math.max(layer[child] || 0, (layer[cur] || 0) + 1);
      inDeg[child]--;
      if (inDeg[child] === 0) queue.push(child);
    }
  }
  // Fallback for cycles
  for (const n of connectedOps) {
    if (layer[n.id] === undefined) layer[n.id] = 0;
  }

  // ── Step 3b: ALAP — push every node as late as possible ──
  const sortedDesc = connectedOps
    .filter((n) => layer[n.id] !== undefined)
    .sort((a, b) => layer[b.id] - layer[a.id]);

  for (const n of sortedDesc) {
    const children = adj[n.id];
    if (!children || children.length === 0) continue;
    const childLayers = children.map((c) => layer[c]).filter((l) => l !== undefined);
    if (childLayers.length === 0) continue;
    layer[n.id] = Math.min(...childLayers) - 1;
  }

  // Compact layer numbering to remove gaps left by ALAP shifts
  const usedLayers = [
    ...new Set(connectedOps.map((n) => layer[n.id]).filter((l) => l !== undefined)),
  ].sort((a, b) => a - b);
  const remap = new Map();
  usedLayers.forEach((l, i) => remap.set(l, i));
  for (const n of connectedOps) {
    if (layer[n.id] !== undefined) layer[n.id] = remap.get(layer[n.id]);
  }

  // ── Step 3c: Insert dummy nodes for long edges ──
  const dummyNodes = [];
  const edgeChains = new Map();
  const removedEdges = new Set();
  const chainEdges = [];
  let dummyCounter = 0;

  for (const e of visibleEdges) {
    const fromLayer = layer[e.from];
    const toLayer = layer[e.to];
    if (toLayer === undefined || fromLayer === undefined) continue;
    const span = toLayer - fromLayer;
    if (span <= 1) continue;

    removedEdges.add(e);
    const chain = [];

    for (let l = fromLayer + 1; l < toLayer; l++) {
      const dId = `__d${dummyCounter++}`;
      dummyNodes.push({ id: dId, isDummy: true });
      layer[dId] = l;
      chain.push(dId);
    }

    edgeChains.set(e, chain);

    const fullChain = [e.from, ...chain, e.to];
    for (let i = 0; i < fullChain.length - 1; i++) {
      chainEdges.push({
        from: fullChain[i],
        to: fullChain[i + 1],
        value: e.value,
        _original: e,
      });
    }
  }

  // Expanded node and edge sets (including dummies)
  const allNodes = [...connectedOps, ...dummyNodes];
  const expandedEdges = [
    ...visibleEdges.filter((e) => !removedEdges.has(e)),
    ...chainEdges,
  ];

  // ── Step 4: Group by layer (including dummy nodes) ──
  const layers = {};
  for (const n of allNodes) {
    const l = layer[n.id];
    if (l === undefined) continue;
    if (!layers[l]) layers[l] = [];
    layers[l].push(n);
  }
  const sortedLayerKeys = Object.keys(layers)
    .map(Number)
    .sort((a, b) => a - b);

  // ── Step 5: Bidirectional barycenter ordering (up to 24 passes, early exit) ──
  const inEdgesOf = {};
  const outEdgesOf = {};
  for (const e of expandedEdges) {
    if (!inEdgesOf[e.to]) inEdgesOf[e.to] = [];
    inEdgesOf[e.to].push(e.from);
    if (!outEdgesOf[e.from]) outEdgesOf[e.from] = [];
    outEdgesOf[e.from].push(e.to);
  }

  let prevOrderHash = "";
  for (let pass = 0; pass < 24; pass++) {
    const goDown = pass % 2 === 0;
    const keys = goDown ? sortedLayerKeys : [...sortedLayerKeys].reverse();

    for (let li = 1; li < keys.length; li++) {
      const currKey = keys[li];
      const prevKey = keys[li - 1];

      const refPos = {};
      layers[prevKey].forEach((n, i) => { refPos[n.id] = i; });

      const currentPos = new Map();
      layers[currKey].forEach((n, i) => { currentPos.set(n.id, i); });

      const edgeMap = goDown ? inEdgesOf : outEdgesOf;

      layers[currKey].sort((a, b) => {
        const aN = (edgeMap[a.id] || []).filter((id) => refPos[id] !== undefined);
        const bN = (edgeMap[b.id] || []).filter((id) => refPos[id] !== undefined);
        const aIdx = currentPos.get(a.id) || 0;
        const bIdx = currentPos.get(b.id) || 0;
        const aAvg = aN.length
          ? aN.reduce((s, id) => s + refPos[id], 0) / aN.length
          : aIdx;
        const bAvg = bN.length
          ? bN.reduce((s, id) => s + refPos[id], 0) / bN.length
          : bIdx;
        if (aAvg !== bAvg) return aAvg - bAvg;
        return (a.locPrefix || "").localeCompare(b.locPrefix || "");
      });
    }

    let orderHash = "";
    for (const lk of sortedLayerKeys) {
      for (const n of layers[lk]) orderHash += n.id + ",";
      orderHash += "|";
    }
    if (orderHash === prevOrderHash) break;
    prevOrderHash = orderHash;
  }

  // ── Step 5a½: Loc-group clustering ──
  // When locGrouping is on, cluster nodes with the same loc prefix together
  // within each layer, while ordering the groups by median barycenter position.
  if (locGrouping) {
    for (const lk of sortedLayerKeys) {
      const layerNodes = layers[lk];
      if (layerNodes.length < 2) continue;

      // Group nodes by their loc prefix (first path segment)
      const groups = new Map(); // locPrefix -> [indices into layerNodes]
      for (let i = 0; i < layerNodes.length; i++) {
        const n = layerNodes[i];
        let prefix = "";
        const loc = n.loc || (n.isDummy ? "" : "");
        if (loc && loc.startsWith("/")) {
          const segs = loc.split("/").filter(Boolean);
          if (segs.length > 0) prefix = "/" + segs[0];
        } else if (loc) {
          prefix = loc;
        }
        if (!groups.has(prefix)) groups.set(prefix, []);
        groups.get(prefix).push(i);
      }

      // If everything is in one group (or no groups), skip
      if (groups.size <= 1) continue;

      // Order groups by the median original position of their members
      const groupOrder = [...groups.entries()].map(([prefix, indices]) => {
        const medianIdx = indices[Math.floor(indices.length / 2)];
        return { prefix, indices, sortKey: medianIdx };
      });
      groupOrder.sort((a, b) => a.sortKey - b.sortKey);

      // Rebuild layer: groups in order, nodes within group in original order
      const newOrder = [];
      for (const g of groupOrder) {
        for (const idx of g.indices) {
          newOrder.push(layerNodes[idx]);
        }
      }

      // Replace layer contents
      layers[lk] = newOrder;
    }
  }

  // ── Step 5b: Adjacent swap crossing reduction ──
  // For each pair of adjacent nodes in a layer, check if swapping reduces
  // edge crossings between this layer and its neighbors.
  for (let pass = 0; pass < 4; pass++) {
    let improved = false;
    for (let li = 0; li < sortedLayerKeys.length; li++) {
      const lk = sortedLayerKeys[li];
      const layerNodes = layers[lk];
      if (layerNodes.length < 2) continue;

      // Build position maps for adjacent layers
      const prevLayer = li > 0 ? layers[sortedLayerKeys[li - 1]] : null;
      const nextLayer = li < sortedLayerKeys.length - 1 ? layers[sortedLayerKeys[li + 1]] : null;
      const adjPos = {};
      if (prevLayer) prevLayer.forEach((n, i) => { adjPos[n.id] = i; });
      if (nextLayer) nextLayer.forEach((n, i) => { adjPos[n.id] = i; });

      // Precompute: for each node in this layer, its list of neighbor positions
      const nodeConns = {};
      for (const n of layerNodes) {
        const conns = [];
        for (const nbr of (inEdgesOf[n.id] || [])) {
          if (adjPos[nbr] !== undefined) conns.push(adjPos[nbr]);
        }
        for (const nbr of (outEdgesOf[n.id] || [])) {
          if (adjPos[nbr] !== undefined) conns.push(adjPos[nbr]);
        }
        nodeConns[n.id] = conns;
      }

      for (let i = 0; i < layerNodes.length - 1; i++) {
        const aConns = nodeConns[layerNodes[i].id];
        const bConns = nodeConns[layerNodes[i + 1].id];

        // Crossings: before swap a<b, crossing when aConn > bConn
        // After swap b<a, crossing when bConn > aConn
        let crossBefore = 0, crossAfter = 0;
        for (const ac of aConns) {
          for (const bc of bConns) {
            if (ac > bc) crossBefore++;
            if (bc > ac) crossAfter++;
          }
        }

        if (crossAfter < crossBefore) {
          [layerNodes[i], layerNodes[i + 1]] = [layerNodes[i + 1], layerNodes[i]];
          improved = true;
        }
      }
    }
    if (!improved) break;
  }

  // ── Common helpers ──
  const positions = {};
  const auxSet = showAux ? new Set(connectedOps.filter(isAuxiliaryOp).map((n) => n.id)) : new Set();
  const dummySet = new Set(dummyNodes.map((n) => n.id));

  function nodeWidth(id) {
    // Aux ops use full node width for layout spacing to prevent overlapping;
    // they are rendered smaller but need the same gap allocation.
    return dummySet.has(id) ? DW : NW;
  }

  // ════════════════════════════════════════════════════════════════════
  // Coordinate assignment — Brandes–Köpf, with loc-aware gaps when
  // locGrouping is on.
  // ════════════════════════════════════════════════════════════════════
  let locGroups = null;

  // Gap between adjacent nodes: dummy nodes get enough spacing so edges
  // don't visually overlap, while real nodes stay compact.
  function locPrefix(n) {
    const loc = n.loc || "";
    if (loc.startsWith("/")) {
      const segs = loc.split("/").filter(Boolean);
      return segs.length > 0 ? "/" + segs[0] : "";
    }
    return loc;
  }

  function pairGap(a, b) {
    if (dummySet.has(a.id) || dummySet.has(b.id)) return 4;
    // Extra gap between different loc groups
    if (locGrouping && locPrefix(a) !== locPrefix(b) && locPrefix(a) && locPrefix(b)) {
      return GX * 2;
    }
    return GX;
  }

  // ── Step 6: Brandes–Köpf coordinate assignment ──
  // Four extreme alignments (up/down × left/right) chain each node to its
  // median neighbour into vertical blocks, blocks are compacted, and the
  // final x is the per-node median of the four candidates. Long-edge dummy
  // chains ("inner segments") are kept perfectly straight via conflict
  // marking, so long edges render as vertical channels instead of
  // diagonals, and there is no cumulative sideways drift.

  const layeringDown = sortedLayerKeys.map((k) => layers[k]);

  // Adjacent-layer neighbour maps, deduplicated.
  const upNbrs = new Map(); // id -> ids in the layer above
  const downNbrs = new Map(); // id -> ids in the layer below
  {
    const seen = new Set();
    for (const e of expandedEdges) {
      if (layer[e.to] !== layer[e.from] + 1) continue;
      const k = e.from + "|" + e.to;
      if (seen.has(k)) continue;
      seen.add(k);
      if (!upNbrs.has(e.to)) upNbrs.set(e.to, []);
      upNbrs.get(e.to).push(e.from);
      if (!downNbrs.has(e.from)) downNbrs.set(e.from, []);
      downNbrs.get(e.from).push(e.to);
    }
  }

  // Minimum centre-to-centre separation between adjacent nodes in a layer.
  function sepOf(a, b) {
    return (nodeWidth(a.id) + nodeWidth(b.id)) / 2 + pairGap(a, b);
  }

  // One alignment pass: vertical alignment to median neighbours, then
  // horizontal compaction over the block graph. Returns centre x per node.
  //
  // Dummy nodes never join alignment blocks: a long edge's dummy chain
  // would otherwise become one rigid vertical unit, and interleaved rigid
  // chains force staircase gaps that inflate graph width by an order of
  // magnitude. Dummies only reserve channel space during compaction; their
  // final x comes from the channel-routing pass below.
  function bkAlignment(layering, neighborFn) {
    const posMap = {};
    layering.forEach((L) => L.forEach((n, i) => { posMap[n.id] = i; }));

    const root = {};
    const align = {};
    for (const L of layering) {
      for (const n of L) { root[n.id] = n.id; align[n.id] = n.id; }
    }

    for (const L of layering) {
      let prevIdx = -1;
      for (const v of L) {
        if (dummySet.has(v.id)) continue;
        const ws = neighborFn(v.id);
        if (!ws || !ws.length) continue;
        const sorted = [...ws].sort((a, b) => posMap[a] - posMap[b]);
        const mp = (sorted.length - 1) / 2;
        for (let i = Math.floor(mp); i <= Math.ceil(mp); i++) {
          const w = sorted[i];
          if (
            align[v.id] === v.id &&
            !dummySet.has(w) &&
            prevIdx < posMap[w]
          ) {
            align[w] = v.id;
            root[v.id] = root[w];
            align[v.id] = root[v.id];
            prevIdx = posMap[w];
          }
        }
      }
    }

    // Block graph: an edge between the blocks of each adjacent node pair.
    const succ = new Map(); // rootId -> Map(rootId -> sep)
    const predCount = new Map();
    const blockRoots = [];
    for (const L of layering) {
      for (const n of L) {
        if (root[n.id] === n.id) {
          blockRoots.push(n.id);
          predCount.set(n.id, 0);
          succ.set(n.id, new Map());
        }
      }
    }
    for (const L of layering) {
      for (let i = 1; i < L.length; i++) {
        const u = root[L[i - 1].id];
        const v = root[L[i].id];
        if (u === v) continue;
        const s = sepOf(L[i - 1], L[i]);
        const m = succ.get(u);
        if (!m.has(v)) {
          m.set(v, s);
          predCount.set(v, predCount.get(v) + 1);
        } else if (s > m.get(v)) {
          m.set(v, s);
        }
      }
    }

    // Topological order (the block graph is acyclic because alignment
    // never reverses within-layer order).
    const topo = [];
    for (const r of blockRoots) if (predCount.get(r) === 0) topo.push(r);
    for (let qi = 0; qi < topo.length; qi++) {
      for (const v of succ.get(topo[qi]).keys()) {
        predCount.set(v, predCount.get(v) - 1);
        if (predCount.get(v) === 0) topo.push(v);
      }
    }

    // Pass 1: leftmost feasible coordinates.
    const xs = {};
    for (const r of blockRoots) xs[r] = 0;
    for (const u of topo) {
      for (const [v, s] of succ.get(u)) {
        if (xs[u] + s > xs[v]) xs[v] = xs[u] + s;
      }
    }
    // Pass 2: pull blocks right toward their successors to reduce spread.
    for (let i = topo.length - 1; i >= 0; i--) {
      const u = topo[i];
      let m = Infinity;
      for (const [v, s] of succ.get(u)) m = Math.min(m, xs[v] - s);
      if (m !== Infinity && m > xs[u]) xs[u] = m;
    }

    const coord = {};
    for (const L of layering) for (const n of L) coord[n.id] = xs[root[n.id]];
    return coord;
  }

  // Run the four alignments.
  const assignments = [];
  for (const vert of ["down", "up"]) {
    for (const horiz of ["l", "r"]) {
      let layering = vert === "down" ? layeringDown : [...layeringDown].reverse();
      if (horiz === "r") layering = layering.map((L) => [...L].reverse());
      const neighborFn =
        vert === "down" ? (id) => upNbrs.get(id) : (id) => downNbrs.get(id);
      const coord = bkAlignment(layering, neighborFn);
      if (horiz === "r") for (const id in coord) coord[id] = -coord[id];
      assignments.push({ horiz, coord });
    }
  }

  // Align all four to the narrowest, then take the per-node median
  // (average of the two middle values) as the final coordinate.
  const ranges = assignments.map(({ coord }) => {
    let mn = Infinity, mx = -Infinity;
    for (const n of allNodes) {
      const half = nodeWidth(n.id) / 2;
      if (coord[n.id] - half < mn) mn = coord[n.id] - half;
      if (coord[n.id] + half > mx) mx = coord[n.id] + half;
    }
    return { mn, mx };
  });
  let bestIdx = 0;
  for (let i = 1; i < ranges.length; i++) {
    if (ranges[i].mx - ranges[i].mn < ranges[bestIdx].mx - ranges[bestIdx].mn) {
      bestIdx = i;
    }
  }
  assignments.forEach(({ horiz, coord }, i) => {
    if (i === bestIdx) return;
    const delta =
      horiz === "l"
        ? ranges[bestIdx].mn - ranges[i].mn
        : ranges[bestIdx].mx - ranges[i].mx;
    if (delta) for (const id in coord) coord[id] += delta;
  });

  for (const lk of sortedLayerKeys) {
    const layerNodes = layers[lk];
    for (let i = 0; i < layerNodes.length; i++) {
      const n = layerNodes[i];
      const isDummy = dummySet.has(n.id);
      const isAux = auxSet.has(n.id);
      const nw = nodeWidth(n.id);
      const nh = isDummy ? 0 : isAux ? AH : NH;
      const vals = assignments
        .map((a) => a.coord[n.id])
        .sort((a, b) => a - b);
      positions[n.id] = {
        x: (vals[1] + vals[2]) / 2 - nw / 2,
        y: lk * (NH + GY) + (isDummy ? NH / 2 : isAux ? (NH - AH) / 2 : 0),
        w: nw,
        h: nh,
        node: n,
        layer: lk,
        idx: i,
        isAux,
        isDummy,
      };
    }
  }

  // Safety sweep: the median-balancing step can in rare cases reintroduce
  // small overlaps — push nodes apart left-to-right within each layer.
  function posGap(a, b) {
    if (a.isDummy || b.isDummy) return 4;
    if (locGrouping && a.node && b.node && locPrefix(a.node) !== locPrefix(b.node)
        && locPrefix(a.node) && locPrefix(b.node)) {
      return GX * 2;
    }
    return GX;
  }

  for (const lk of sortedLayerKeys) {
    const sorted = layers[lk]
      .map((n) => positions[n.id])
      .sort((a, b) => a.x - b.x);
    for (let i = 1; i < sorted.length; i++) {
      const minX = sorted[i - 1].x + sorted[i - 1].w + posGap(sorted[i - 1], sorted[i]);
      if (sorted[i].x < minX) sorted[i].x = minX;
    }
  }

  // ── Step 6c: Route long-edge channels ──
  // Each dummy is confined to the corridor between its nearest real
  // neighbours in the crossing-reduced layer ordering — channels stay in
  // the gutters the barycenter pass assigned them, so parallel chains
  // don't braid or cut across the graph. Within its corridor, each chain
  // is seeded on the straight line between its endpoints and relaxed by
  // pulling every dummy toward the midpoint of its chain neighbours.
  {
    const M = 10; // clearance between an edge channel and a node

    // Corridor bounds per dummy, from the layer ordering.
    const boundsOf = new Map(); // dummyId -> [lo, hi] for the channel centre
    for (const lk of sortedLayerKeys) {
      const layerNodes = layers[lk];
      // Nearest real node to the left of each index
      let leftReal = null;
      const leftAt = new Array(layerNodes.length);
      for (let i = 0; i < layerNodes.length; i++) {
        leftAt[i] = leftReal;
        if (!dummySet.has(layerNodes[i].id)) leftReal = positions[layerNodes[i].id];
      }
      let rightReal = null;
      for (let i = layerNodes.length - 1; i >= 0; i--) {
        const n = layerNodes[i];
        if (!dummySet.has(n.id)) {
          rightReal = positions[n.id];
          continue;
        }
        const lo = leftAt[i] ? leftAt[i].x + leftAt[i].w + M : -Infinity;
        const hi = rightReal ? rightReal.x - M : Infinity;
        boundsOf.set(n.id, lo <= hi ? [lo, hi] : [(lo + hi) / 2, (lo + hi) / 2]);
      }
    }

    function clampChannel(id, cx) {
      const b = boundsOf.get(id);
      if (!b) return cx;
      return Math.min(b[1], Math.max(b[0], cx));
    }

    for (const [origEdge, chain] of edgeChains) {
      const fromPos = positions[origEdge.from];
      const toPos = positions[origEdge.to];
      if (!fromPos || !toPos) continue;
      const x0 = fromPos.x + fromPos.w / 2;
      const x1 = toPos.x + toPos.w / 2;
      const steps = chain.length + 1;
      for (let i = 0; i < chain.length; i++) {
        const dp = positions[chain[i]];
        if (!dp) continue;
        const t = (i + 1) / steps;
        dp.x = clampChannel(chain[i], x0 + (x1 - x0) * t) - dp.w / 2;
      }
    }

    // Alternate sweep direction so lateral moves diffuse both ways along
    // the chain, turning corridor jumps into gentle multi-layer diagonals.
    for (let pass = 0; pass < 40; pass++) {
      const fwd = pass % 2 === 0;
      for (const [origEdge, chain] of edgeChains) {
        if (!chain.length) continue;
        const fromPos = positions[origEdge.from];
        const toPos = positions[origEdge.to];
        if (!fromPos || !toPos) continue;
        for (let k = 0; k < chain.length; k++) {
          const i = fwd ? k : chain.length - 1 - k;
          const dp = positions[chain[i]];
          if (!dp) continue;
          const prev = i === 0 ? fromPos : positions[chain[i - 1]];
          const next = i === chain.length - 1 ? toPos : positions[chain[i + 1]];
          const target = (prev.x + prev.w / 2 + next.x + next.w / 2) / 2;
          dp.x = clampChannel(chain[i], target) - dp.w / 2;
        }
      }
    }

    // Snap chains into vertical runs: for each maximal stretch of a chain
    // whose corridors still share a common x, pin every dummy to that x.
    // Relaxation alone leaves gentle waves; snapping commits each stretch
    // to a straight vertical line with a single bend between stretches.
    for (const [, chain] of edgeChains) {
      if (!chain.length) continue;
      let i = 0;
      while (i < chain.length) {
        let lo = -Infinity;
        let hi = Infinity;
        let sum = 0;
        let j = i;
        while (j < chain.length) {
          const b = boundsOf.get(chain[j]);
          const nlo = b ? Math.max(lo, b[0]) : lo;
          const nhi = b ? Math.min(hi, b[1]) : hi;
          if (nlo > nhi) break;
          lo = nlo;
          hi = nhi;
          const dp = positions[chain[j]];
          sum += dp.x + dp.w / 2;
          j++;
        }
        const cx = Math.min(hi, Math.max(lo, sum / (j - i)));
        for (let k = i; k < j; k++) {
          const dp = positions[chain[k]];
          dp.x = cx - dp.w / 2;
        }
        i = j;
      }
    }

    // Fan coincident channels apart into parallel lanes so bundled edges
    // stay individually traceable. Chains are ordered by their target's x
    // (stable across layers), so a bundle keeps one internal order and
    // fans out at its exit without braiding.
    const LANE = 6;
    const laneKey = new Map(); // dummyId -> stable sort key
    for (const [origEdge, chain] of edgeChains) {
      const toPos = positions[origEdge.to];
      const fromPos = positions[origEdge.from];
      const key =
        (toPos ? toPos.x + toPos.w / 2 : 0) * 1e7 +
        (fromPos ? fromPos.x + fromPos.w / 2 : 0);
      for (const d of chain) laneKey.set(d, key);
    }
    for (const lk of sortedLayerKeys) {
      const ds = layers[lk]
        .filter((n) => dummySet.has(n.id))
        .map((n) => positions[n.id]);
      if (ds.length < 2) continue;
      ds.sort(
        (a, b) =>
          a.x - b.x || laneKey.get(a.node.id) - laneKey.get(b.node.id)
      );
      for (let i = 1; i < ds.length; i++) {
        const prev = ds[i - 1];
        const cur = ds[i];
        if (cur.x < prev.x + LANE) {
          const b = boundsOf.get(cur.node.id);
          const maxX = b ? b[1] - cur.w / 2 : Infinity;
          cur.x = Math.max(cur.x, Math.min(prev.x + LANE, maxX));
        }
      }
    }
  }

  // Global shift: ensure graph starts at x=20
  let globalMinX = Infinity;
  let globalMaxX = -Infinity;
  for (const p of Object.values(positions)) {
    if (p.isDummy) continue;
    globalMinX = Math.min(globalMinX, p.x);
    globalMaxX = Math.max(globalMaxX, p.x + p.w);
  }
  if (!isFinite(globalMinX)) { globalMinX = 0; globalMaxX = 0; }
  const shiftX = -globalMinX + 20;
  for (const p of Object.values(positions)) p.x += shiftX;

  // ── Step 7b: Compute loc group bounding boxes (visual overlays only) ──
  if (locGrouping) {
    function bbox(posArr, pad, labelH) {
      let minX = Infinity, minY = Infinity, maxBX = -Infinity, maxBY = -Infinity;
      for (const p of posArr) {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxBX = Math.max(maxBX, p.x + p.w);
        maxBY = Math.max(maxBY, p.y + p.h);
      }
      return {
        x: minX - pad, y: minY - pad - labelH,
        w: maxBX - minX + pad * 2, h: maxBY - minY + pad * 2 + labelH,
      };
    }

    // Build group maps
    const level0Map = {};
    const level1Map = {};
    const leafMap = {};
    const flatMap = {};
    for (const p of Object.values(positions)) {
      if (p.isDummy) continue;
      const loc = p.node.loc;
      if (!loc) continue;

      if (!loc.startsWith("/")) {
        if (!flatMap[loc]) flatMap[loc] = [];
        flatMap[loc].push(p);
        continue;
      }

      const segments = loc.split("/").filter(Boolean);
      if (segments.length < 1) continue;

      const key0 = "/" + segments[0];
      if (!level0Map[key0]) level0Map[key0] = [];
      level0Map[key0].push(p);

      if (segments.length >= 2) {
        const key1 = "/" + segments[0] + "/" + segments[1];
        if (!level1Map[key1]) level1Map[key1] = [];
        level1Map[key1].push(p);
      }

      if (segments.length > 2) {
        if (!leafMap[loc]) leafMap[loc] = [];
        leafMap[loc].push(p);
      }
    }

    // Compute bounding boxes directly from node positions — no separation
    locGroups = [];

    for (const [loc, posArr] of Object.entries(level0Map)) {
      locGroups.push({ loc, depth: 0, ...bbox(posArr, 24, 22), count: posArr.length });
    }

    for (const [loc, posArr] of Object.entries(level1Map)) {
      const parentKey = "/" + loc.split("/").filter(Boolean)[0];
      const siblingKeys = Object.keys(level1Map).filter((k) => k.startsWith(parentKey + "/"));
      if (siblingKeys.length >= 2) {
        locGroups.push({ loc, depth: 1, ...bbox(posArr, 16, 18), count: posArr.length });
      }
    }

    for (const [loc, posArr] of Object.entries(leafMap)) {
      if (posArr.length < 1) continue;
      locGroups.push({ loc, depth: 2, ...bbox(posArr, 8, 14), count: posArr.length });
    }

    for (const [loc, posArr] of Object.entries(flatMap)) {
      if (posArr.length < 1) continue;
      locGroups.push({ loc, depth: 2, ...bbox(posArr, 8, 14), count: posArr.length });
    }

    locGroups.sort((a, b) => a.depth - b.depth || a.loc.localeCompare(b.loc));
  }

  // ── Final dimensions ──
  let finalMinX = Infinity, finalMaxX = -Infinity;
  for (const p of Object.values(positions)) {
    if (p.isDummy) continue;
    finalMinX = Math.min(finalMinX, p.x);
    finalMaxX = Math.max(finalMaxX, p.x + p.w);
  }
  if (!isFinite(finalMinX)) { finalMinX = 0; finalMaxX = 0; }
  const finalW = finalMaxX - finalMinX + 40;
  const maxY = sortedLayerKeys.length * (NH + GY);

  // ── Step 7: Edge geometry with waypoints and port spreading ──
  const fromEdgesMap = {};
  const toEdgesMap = {};
  for (const e of visibleEdges) {
    if (positions[e.to]) {
      if (!fromEdgesMap[e.from]) fromEdgesMap[e.from] = [];
      fromEdgesMap[e.from].push(e);
    }
    if (positions[e.from]) {
      if (!toEdgesMap[e.to]) toEdgesMap[e.to] = [];
      toEdgesMap[e.to].push(e);
    }
  }
  function outgoingX(e) {
    const chain = edgeChains.get(e);
    if (chain && chain.length > 0) {
      const dp = positions[chain[0]];
      if (dp) return dp.x + dp.w / 2;
    }
    return positions[e.to] ? positions[e.to].x + positions[e.to].w / 2 : 0;
  }
  function incomingX(e) {
    const chain = edgeChains.get(e);
    if (chain && chain.length > 0) {
      const dp = positions[chain[chain.length - 1]];
      if (dp) return dp.x + dp.w / 2;
    }
    return positions[e.from] ? positions[e.from].x + positions[e.from].w / 2 : 0;
  }
  for (const id in fromEdgesMap) {
    fromEdgesMap[id].sort((a, b) => outgoingX(a) - outgoingX(b));
  }
  for (const id in toEdgesMap) {
    toEdgesMap[id].sort((a, b) => incomingX(a) - incomingX(b));
  }

  const layoutEdges = [];

  for (const e of visibleEdges) {
    if (removedEdges.has(e)) continue;
    const fromPos = positions[e.from];
    const toPos = positions[e.to];
    if (!fromPos || !toPos) continue;

    const fromEdges = fromEdgesMap[e.from] || [];
    const toEdges = toEdgesMap[e.to] || [];
    const fi = fromEdges.indexOf(e);
    const ti = toEdges.indexOf(e);
    const fSpread = fromEdges.length > 1
      ? (fi / (fromEdges.length - 1) - 0.5) * (fromPos.w * 0.6) : 0;
    const tSpread = toEdges.length > 1
      ? (ti / (toEdges.length - 1) - 0.5) * (toPos.w * 0.6) : 0;

    layoutEdges.push({
      ...e,
      points: [
        { x: fromPos.x + fromPos.w / 2 + fSpread, y: fromPos.y + fromPos.h },
        { x: toPos.x + toPos.w / 2 + tSpread, y: toPos.y },
      ],
      layerDist: 1,
    });
  }

  for (const [origEdge, chain] of edgeChains) {
    const fromPos = positions[origEdge.from];
    const toPos = positions[origEdge.to];
    if (!fromPos || !toPos) continue;

    const fromEdges = fromEdgesMap[origEdge.from] || [];
    const toEdges = toEdgesMap[origEdge.to] || [];
    const fi = fromEdges.indexOf(origEdge);
    const ti = toEdges.indexOf(origEdge);
    const fSpread = fromEdges.length > 1
      ? (fi / (fromEdges.length - 1) - 0.5) * (fromPos.w * 0.6) : 0;
    const tSpread = toEdges.length > 1
      ? (ti / (toEdges.length - 1) - 0.5) * (toPos.w * 0.6) : 0;

    const points = [
      { x: fromPos.x + fromPos.w / 2 + fSpread, y: fromPos.y + fromPos.h },
    ];
    for (const dId of chain) {
      const dp = positions[dId];
      if (dp) points.push({ x: dp.x + dp.w / 2, y: dp.y });
    }
    points.push(
      { x: toPos.x + toPos.w / 2 + tSpread, y: toPos.y },
    );

    layoutEdges.push({
      from: origEdge.from,
      to: origEdge.to,
      value: origEdge.value,
      points,
      layerDist: chain.length + 1,
    });
  }

  return {
    nodes: Object.values(positions).filter((p) => !p.isDummy),
    edges: layoutEdges,
    w: finalW + 40,
    h: maxY + 40,
    NW,
    NH,
    GY,
    locGroups,
  };
}
