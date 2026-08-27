/**
 * Cross-snapshot op matching engine.
 *
 * Given two parsed snapshots (adjacent compiler passes), produces a
 * MatchSet describing how ops map across the pass:
 *   1→1 same     — op survived untouched (modulo SSA renumbering)
 *   1→1 changed  — same anchor, different attributes/types/text
 *   1→n split    — lowering/decomposition (leaf loc fans out)
 *   n→1 merged   — fusion (fused-loc provenance converges)
 *   1→0 / 0→1    — removed / added
 *
 * Tiers, each consuming ops from both pools:
 *   1. symbol       — unique (scope, attrs.name) equality
 *   2. loc, scoped  — connected components over shared loc leaves,
 *                     keyed within the enclosing symbol scope
 *   3. loc, global  — same, ignoring scope (ops migrate between funcs,
 *                     e.g. into IREE executables)
 *   4. structure    — for loc-less inputs (Caffe, stripped MLIR):
 *                     (scope, opName) buckets, order-preserving greedy
 *                     alignment within a ±window
 *
 * Pure module: no registry access, no DOM. Overrides (manual link/unlink,
 * referenced by NodeKey) are applied as a deterministic post-pass.
 */

import { getBodyOps } from "../extensions/matcher.js";
import { computeScopes, resolveKeys } from "./node-key.js";

const SCORE_THRESHOLD = 3.0;
const STRUCTURE_THRESHOLD = 2.0;
const STRUCTURE_WINDOW = 8;
const COMPONENT_PAIR_CAP = 10000;

// ── Feature extraction ────────────────────────────────────────────────

/**
 * Text used for same-vs-changed detection: the op line PLUS its captured
 * region body and full parameter list, so a body-only rewrite (e.g. inside
 * linalg.generic) or a change to an attribute beyond op.trimmed's capped
 * summary still registers as "changed". SSA names are normalized away and
 * per-line trailing locs stripped.
 */
function normalizeText(op) {
  const lines = [op.trimmed, ...(op.genericBody || []), ...(op.paramLines || [])];
  return lines
    .map((l) =>
      l.replace(/\s*loc\(.*\)\s*$/, "").replace(/%[\w#.$]+(?::\d+)?/g, "%")
    )
    .join("\n");
}

function fingerprintOf(op) {
  const body = [...getBodyOps(op)].sort().join(",");
  const iters = (op.attrs?._iters || []).join(",");
  return `${op.opName}|${op.types.join(",")}|${body}|${iters}`;
}

/** Per-snapshot feature table + adjacency, one linear pass. */
function extractFeatures(ops, graph) {
  const scopes = computeScopes(ops);
  const feats = new Map();
  for (const op of ops) {
    const leaves = [];
    if (op.loc) leaves.push(op.loc);
    if (op.locAll) {
      for (const l of op.locAll) if (!leaves.includes(l)) leaves.push(l);
    }
    feats.set(op.id, {
      op,
      scope: scopes.get(op.id) || "",
      symbol: op.attrs?.name || null,
      leaves,
      fingerprint: fingerprintOf(op),
      resultNames: new Set(op.rawResults),
      normText: normalizeText(op),
    });
  }
  const adjacency = new Map();
  const addAdj = (a, b) => {
    if (!adjacency.has(a)) adjacency.set(a, new Set());
    adjacency.get(a).add(b);
  };
  for (const e of graph?.edges || []) {
    addAdj(e.from, e.to);
    addAdj(e.to, e.from);
  }
  return { feats, adjacency };
}

// ── Scoring ───────────────────────────────────────────────────────────

function jaccard(aIter, bIter) {
  const a = aIter instanceof Set ? aIter : new Set(aIter);
  const b = bIter instanceof Set ? bIter : new Set(bIter);
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

function makeScorer(A, B, matchedAtoB) {
  return function score(aId, bId) {
    const fa = A.feats.get(aId);
    const fb = B.feats.get(bId);
    let s = 0;
    if (fa.op.opName === fb.op.opName) s += 3;
    s += 2 * jaccard(fa.op.types, fb.op.types);
    if (fa.fingerprint === fb.fingerprint) s += 2;
    s += jaccard(fa.resultNames, fb.resultNames);
    // Neighborhood: fraction of a's already-matched graph neighbors that
    // landed adjacent to b on the other side.
    const aNbrs = A.adjacency.get(aId);
    const bNbrs = B.adjacency.get(bId);
    if (aNbrs && bNbrs) {
      let mapped = 0;
      let total = 0;
      for (const n of aNbrs) {
        const to = matchedAtoB.get(n);
        if (to === undefined) continue;
        total++;
        for (const t of to) if (bNbrs.has(t)) { mapped++; break; }
      }
      if (total > 0) s += mapped / total;
    }
    return s;
  };
}

// ── Match assembly ────────────────────────────────────────────────────

function makeCollector() {
  const matches = [];
  const matchedA = new Set();
  const matchedB = new Set();
  const matchedAtoB = new Map(); // aId → [bIds], feeds neighborhood scoring
  function add(from, to, kind, confidence, via) {
    const m = { from, to, kind, confidence, via };
    matches.push(m);
    for (const a of from) {
      matchedA.add(a);
      matchedAtoB.set(a, to);
    }
    for (const b of to) matchedB.add(b);
    return m;
  }
  /** Fold a leftover op into an existing match as a merge/split member. */
  function extend(m, side, id) {
    m[side].push(id);
    if (side === "from") {
      matchedA.add(id);
      matchedAtoB.set(id, m.to);
    } else {
      matchedB.add(id);
    }
    m.kind =
      m.to.length >= m.from.length && m.to.length > 1 ? "split" : "merged";
    m.confidence = Math.min(m.confidence, 0.55);
    m.via = "fused-loc";
  }
  return { matches, matchedA, matchedB, matchedAtoB, add, extend };
}

function oneToOneKind(A, B, aId, bId) {
  return A.feats.get(aId).normText === B.feats.get(bId).normText
    ? "same"
    : "changed";
}

/** Greedy best-score bipartite pairing within a candidate set. */
function greedyPair(aIds, bIds, score, threshold) {
  const pairs = [];
  for (const a of aIds) {
    for (const b of bIds) {
      const s = score(a, b);
      if (s >= threshold) pairs.push({ a, b, s });
    }
  }
  pairs.sort((x, y) => y.s - x.s);
  const usedA = new Set();
  const usedB = new Set();
  const picked = [];
  for (const p of pairs) {
    if (usedA.has(p.a) || usedB.has(p.b)) continue;
    usedA.add(p.a);
    usedB.add(p.b);
    picked.push(p);
  }
  return picked;
}

/**
 * Resolve one connected component of the leaf-sharing bipartite graph.
 * Shapes: 1×1 → direct match; 1×k → split (all plausible members);
 * k×1 → merged; m×n → greedy 1:1 pairing by score.
 */
function resolveComponent(aIds, bIds, A, B, col, score, allowLeafSplit = true) {
  if (aIds.length === 1 && bIds.length === 1) {
    const [a] = aIds;
    const [b] = bIds;
    const sameOp = A.feats.get(a).op.opName === B.feats.get(b).op.opName;
    col.add([a], [b], oneToOneKind(A, B, a, b), sameOp ? 0.95 : 0.85, "loc");
    return;
  }
  if (aIds.length === 1 && bIds.length > 1) {
    // Shared leaf provenance: all descendants form the split set, whether
    // or not they resemble the source op (lowering changes everything).
    const [a] = aIds;
    const passers = bIds.filter((b) => score(a, b) >= SCORE_THRESHOLD);
    col.add([a], [...bIds], "split", passers.length >= 2 ? 0.8 : 0.6, "fused-loc");
    return;
  }
  if (aIds.length > 1 && bIds.length === 1) {
    col.add([...aIds], [bIds[0]], "merged", 0.75, "fused-loc");
    return;
  }
  // Oversized m×n components arise when fused locs chain many leaves into
  // one blob (e.g. initializers spanning every global). Decompose per leaf:
  // each single leaf is a small, semantically tight cluster.
  if (aIds.length * bIds.length > COMPONENT_PAIR_CAP) {
    if (!allowLeafSplit) {
      // Hub leaf still too big: last-resort opName-bucket greedy
      const byOp = new Map();
      for (const b of bIds) {
        const key = B.feats.get(b).op.opName;
        if (!byOp.has(key)) byOp.set(key, []);
        byOp.get(key).push(b);
      }
      for (const a of aIds) {
        const cands = (byOp.get(A.feats.get(a).op.opName) || []).filter(
          (b) => !col.matchedB.has(b)
        );
        const picked = greedyPair([a], cands, score, SCORE_THRESHOLD);
        for (const p of picked) {
          col.add([p.a], [p.b], oneToOneKind(A, B, p.a, p.b), 0.7, "loc+fp");
        }
      }
      return;
    }
    const bByLeaf = new Map();
    for (const b of bIds) {
      for (const leaf of B.feats.get(b).leaves) {
        if (!bByLeaf.has(leaf)) bByLeaf.set(leaf, []);
        bByLeaf.get(leaf).push(b);
      }
    }
    const seenLeaves = new Set();
    for (const a of aIds) {
      for (const leaf of A.feats.get(a).leaves) {
        if (seenLeaves.has(leaf) || !bByLeaf.has(leaf)) continue;
        seenLeaves.add(leaf);
        const subA = aIds.filter(
          (x) => !col.matchedA.has(x) && A.feats.get(x).leaves.includes(leaf)
        );
        const subB = bByLeaf.get(leaf).filter((x) => !col.matchedB.has(x));
        if (subA.length && subB.length) {
          resolveComponent(subA, subB, A, B, col, score, false);
        }
      }
    }
    return;
  }
  const picked = greedyPair(aIds, bIds, score, SCORE_THRESHOLD);
  const usedA = new Set(picked.map((p) => p.a));
  const usedB = new Set(picked.map((p) => p.b));
  const pairMatches = picked.map((p) => ({
    p,
    m: col.add(
      [p.a],
      [p.b],
      oneToOneKind(A, B, p.a, p.b),
      Math.min(0.9, 0.7 + p.s / 20),
      "loc+fp"
    ),
  }));
  const restA = aIds.filter((a) => !usedA.has(a));
  const restB = bIds.filter((b) => !usedB.has(b));
  // Leftovers on both sides still share provenance — one low-confidence
  // group match rather than pretending they were removed and re-added
  // (typical for cross-dialect lowering where nothing scores well).
  if (restA.length && restB.length) {
    col.add(
      restA,
      restB,
      restB.length >= restA.length ? "split" : "merged",
      0.5,
      "fused-loc"
    );
    return;
  }
  // One-sided leftovers fold into the best existing pair of the component:
  // the pass consolidated them into (or expanded them out of) a survivor.
  // Preferred pair = graph-adjacent on the same side, then best score.
  if (pairMatches.length) {
    for (const a of restA) {
      let best = null;
      for (const pm of pairMatches) {
        let s = score(a, pm.p.b) / 10;
        if (A.adjacency.get(a)?.has(pm.p.a)) s += 1;
        if (!best || s > best.s) best = { pm, s };
      }
      col.extend(best.pm.m, "from", a);
    }
    for (const b of restB) {
      let best = null;
      for (const pm of pairMatches) {
        let s = score(pm.p.a, b) / 10;
        if (B.adjacency.get(b)?.has(pm.p.b)) s += 1;
        if (!best || s > best.s) best = { pm, s };
      }
      col.extend(best.pm.m, "to", b);
    }
  }
}

/**
 * Loc tier: build the bipartite leaf-sharing graph over still-unmatched
 * ops and resolve each connected component. `scoped` keys leaves within
 * the enclosing symbol scope.
 */
function runLocTier(A, B, col, score, scoped) {
  const leafKey = (f, leaf) => (scoped ? `${f.scope} ${leaf}` : leaf);
  const aByLeaf = new Map();
  const bByLeaf = new Map();
  const index = (side, byLeaf, matched) => {
    for (const [id, f] of side.feats) {
      if (matched.has(id)) continue;
      for (const leaf of f.leaves) {
        const k = leafKey(f, leaf);
        if (!byLeaf.has(k)) byLeaf.set(k, []);
        byLeaf.get(k).push(id);
      }
    }
  };
  index(A, aByLeaf, col.matchedA);
  index(B, bByLeaf, col.matchedB);

  // Union-find over "a:<id>" / "b:<id>" nodes linked through shared leaves
  const parent = new Map();
  const find = (x) => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r);
    while (parent.get(x) !== r) {
      const nx = parent.get(x);
      parent.set(x, r);
      x = nx;
    }
    return r;
  };
  const union = (x, y) => {
    if (!parent.has(x)) parent.set(x, x);
    if (!parent.has(y)) parent.set(y, y);
    const rx = find(x);
    const ry = find(y);
    if (rx !== ry) parent.set(rx, ry);
  };
  for (const [leaf, aIds] of aByLeaf) {
    const bIds = bByLeaf.get(leaf);
    if (!bIds) continue;
    const first = `a:${aIds[0]}`;
    for (const a of aIds) union(first, `a:${a}`);
    for (const b of bIds) union(first, `b:${b}`);
  }

  const components = new Map(); // root → {a: [], b: []}
  for (const node of parent.keys()) {
    const root = find(node);
    if (!components.has(root)) components.set(root, { a: [], b: [] });
    const comp = components.get(root);
    const id = Number(node.slice(2));
    if (node[0] === "a") comp.a.push(id);
    else comp.b.push(id);
  }
  for (const { a, b } of components.values()) {
    const aLive = a.filter((id) => !col.matchedA.has(id));
    const bLive = b.filter((id) => !col.matchedB.has(id));
    if (aLive.length && bLive.length) {
      resolveComponent(aLive, bLive, A, B, col, score);
    }
  }
}

/** Structure tier for loc-less ops: (scope, opName) buckets, ±window greedy. */
function runStructureTier(A, B, col, score) {
  const bucketOf = (f) => `${f.scope} ${f.op.opName}`;
  const aBuckets = new Map();
  const bBuckets = new Map();
  // Only ops with NO loc leaves participate — a loc-carrying op whose leaf
  // found no counterpart was genuinely removed/added, and gluing it to an
  // unrelated op by shape would hide that.
  for (const [id, f] of A.feats) {
    if (col.matchedA.has(id) || f.leaves.length) continue;
    const k = bucketOf(f);
    if (!aBuckets.has(k)) aBuckets.set(k, []);
    aBuckets.get(k).push(id);
  }
  for (const [id, f] of B.feats) {
    if (col.matchedB.has(id) || f.leaves.length) continue;
    const k = bucketOf(f);
    if (!bBuckets.has(k)) bBuckets.set(k, []);
    bBuckets.get(k).push(id);
  }
  for (const [key, aIds] of aBuckets) {
    const bIds = bBuckets.get(key);
    if (!bIds) continue;
    for (let i = 0; i < aIds.length; i++) {
      if (col.matchedA.has(aIds[i])) continue;
      // Candidates near the same relative position in the other bucket
      const center = Math.round((i / Math.max(1, aIds.length - 1)) * (bIds.length - 1)) || 0;
      let best = null;
      for (
        let j = Math.max(0, center - STRUCTURE_WINDOW);
        j < Math.min(bIds.length, center + STRUCTURE_WINDOW + 1);
        j++
      ) {
        if (col.matchedB.has(bIds[j])) continue;
        const s = score(aIds[i], bIds[j]);
        if (s >= STRUCTURE_THRESHOLD && (!best || s > best.s)) {
          best = { b: bIds[j], s };
        }
      }
      if (best) {
        col.add(
          [aIds[i]],
          [best.b],
          oneToOneKind(A, B, aIds[i], best.b),
          Math.min(0.7, 0.5 + best.s / 30),
          "structure"
        );
      }
    }
  }
}

// ── Overrides ─────────────────────────────────────────────────────────

function applyOverrides(col, overrides, prevOps, nextOps, A, B) {
  for (const o of overrides || []) {
    const fromIds = resolveKeys(o.from, prevOps).ids;
    const toIds = resolveKeys(o.to, nextOps).ids;
    const touches = (m) =>
      m.from.some((id) => fromIds.includes(id)) ||
      m.to.some((id) => toIds.includes(id));
    // Both actions clear any auto match touching the referenced ops
    for (let i = col.matches.length - 1; i >= 0; i--) {
      if (touches(col.matches[i])) {
        const [m] = col.matches.splice(i, 1);
        for (const a of m.from) {
          col.matchedA.delete(a);
          col.matchedAtoB.delete(a);
        }
        for (const b of m.to) col.matchedB.delete(b);
      }
    }
    if (o.action === "link" && fromIds.length && toIds.length) {
      let kind;
      if (fromIds.length === 1 && toIds.length === 1) {
        kind = oneToOneKind(A, B, fromIds[0], toIds[0]);
      } else if (fromIds.length === 1) {
        kind = "split";
      } else {
        kind = "merged";
      }
      col.add(fromIds, toIds, kind, 1.0, "manual");
    }
  }
}

// ── Entry point ───────────────────────────────────────────────────────

/**
 * @param {Array} prevOps  parsed ops of snapshot i
 * @param {Object} prevGraph  buildGraph(prevOps)
 * @param {Array} nextOps  parsed ops of snapshot i+1
 * @param {Object} nextGraph  buildGraph(nextOps)
 * @param {Array} overrides  [{action:"link"|"unlink", from:[NodeKey], to:[NodeKey]}]
 * @returns MatchSet {matches, added, removed, fromIndex, toIndex}
 */
export function matchSnapshots(prevOps, prevGraph, nextOps, nextGraph, overrides = []) {
  const A = extractFeatures(prevOps, prevGraph);
  const B = extractFeatures(nextOps, nextGraph);
  const col = makeCollector();
  const score = makeScorer(A, B, col.matchedAtoB);

  // Tier 1: unique symbol anchors
  const symKey = (f) => `${f.scope} ${f.symbol}`;
  const aBySym = new Map();
  const bBySym = new Map();
  for (const [id, f] of A.feats) {
    if (!f.symbol) continue;
    const k = symKey(f);
    aBySym.set(k, aBySym.has(k) ? null : id); // null marks duplicates
  }
  for (const [id, f] of B.feats) {
    if (!f.symbol) continue;
    const k = symKey(f);
    bBySym.set(k, bBySym.has(k) ? null : id);
  }
  for (const [k, aId] of aBySym) {
    const bId = bBySym.get(k);
    if (aId != null && bId != null) {
      col.add([aId], [bId], oneToOneKind(A, B, aId, bId), 1.0, "symbol");
    }
  }

  // Tiers 2–3: loc components, scoped then global
  runLocTier(A, B, col, score, true);
  runLocTier(A, B, col, score, false);

  // Tier 4: structural alignment for whatever remains
  runStructureTier(A, B, col, score);

  // Manual corrections overlay
  applyOverrides(col, overrides, prevOps, nextOps, A, B);

  // Leftovers + indices
  const removed = [];
  const added = [];
  for (const op of prevOps) if (!col.matchedA.has(op.id)) removed.push(op.id);
  for (const op of nextOps) if (!col.matchedB.has(op.id)) added.push(op.id);
  const fromIndex = new Map();
  const toIndex = new Map();
  for (const m of col.matches) {
    for (const a of m.from) fromIndex.set(a, m);
    for (const b of m.to) toIndex.set(b, m);
  }
  return { matches: col.matches, removed, added, fromIndex, toIndex };
}
