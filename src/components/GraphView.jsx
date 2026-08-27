/**
 * GraphView — interactive canvas-based DAG visualization.
 *
 * Renders the computed layout onto an HTML canvas with:
 *   - Pan (drag) and zoom (scroll wheel)
 *   - Click on nodes to highlight their def-use chain
 *   - Fit-to-view on layout change (not on highlight change)
 *   - Edge routing: long-distance edges routed around intermediate nodes
 *   - Viewport culling, LOD rendering, and RAF-throttled redraws
 */

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { colors } from "../utils/theme.js";
import { getHighlightedNodeSets } from "../graph/build-graph.js";
import { computeLayout } from "../graph/layout.js";
import { reconcileLayout } from "../graph/reconcile-layout.js";
import { drawGrid, drawEdges, drawNodes, drawLocGroups, drawGhostNodes, drawOverlays } from "../graph/canvas-renderer.js";
import { buildSpatialGrid } from "../graph/spatial-index.js";

const C = colors;

const toolbarBtn = {
  padding: "2px 8px",
  borderRadius: 3,
  border: `1px solid ${C.border}`,
  background: C.surface,
  color: C.dim,
  fontSize: 10,
  cursor: "pointer",
  lineHeight: "18px",
};

export default function GraphView({
  ops,
  graph,
  hiVals,
  onValClick,
  registry,
  // Pass-pipeline context (all optional; absent for single documents):
  stepContext,      // {prevPos: Map<opId,{x,y}>|null, diff, ghosts} for this snapshot
  probeHalos,       // Map<opId, colorString> — tracked-probe membership
  hiGhostId,        // ghost to emphasize (sidebar removed-row click)
  snapshotIdx,      // index of the rendered snapshot in the series
  onLayoutRendered, // ({idx, posById, layout}) → parent records for the next step
}) {
  const canvasRef = useRef(null);
  const viewState = useRef({ px: 40, py: 40, z: 1, drag: false, lx: 0, ly: 0 });
  const rafId = useRef(null);
  const dirty = useRef(false);
  const [, setTick] = useState(0);
  const [showAux, setShowAux] = useState(true);
  const [locGrouping, setLocGrouping] = useState(false);
  const [subgraphMode, setSubgraphMode] = useState(false);

  // Exit subgraph mode when the selection is cleared (empty subgraph is useless)
  useEffect(() => {
    if (subgraphMode && hiVals.length === 0) setSubgraphMode(false);
  }, [subgraphMode, hiVals]);

  // In subgraph mode, only lay out selected nodes and their direct neighbors.
  // Selection changes flow through hiVals, so the subgraph re-layouts live.
  const layoutOps = useMemo(() => {
    if (!subgraphMode || hiVals.length === 0) return ops;
    const { primary, related } = getHighlightedNodeSets(hiVals, graph);
    return ops.filter((o) => primary.has(o.id) || related.has(o.id));
  }, [ops, graph, hiVals, subgraphMode]);

  // registry is a dep: profile changes alter op classification (layout) and node colors/labels (draw)
  const rawLayout = useMemo(() => computeLayout(layoutOps, graph, showAux, locGrouping), [layoutOps, graph, showAux, locGrouping, registry]);

  // Subgraph stability: reconcile each fresh layout against the previous
  // node positions so growing/shrinking the trace doesn't reshuffle nodes
  // the user is already looking at. Positions persist across selection
  // changes via a ref; cleared when leaving subgraph mode.
  //
  // Pass-timeline stepping deliberately does NOT reconcile: reconciliation
  // rebuilds edges as plain 2-point curves and degrades placement, which
  // reads as a broken layout on full-size graphs. Snapshots always get the
  // full layout engine; step continuity comes from anchoring the CAMERA to
  // matched nodes instead (below).
  const prevSubPos = useRef(null);
  const layout = useMemo(() => {
    if (!subgraphMode) {
      prevSubPos.current = null;
      return rawLayout;
    }
    const reconciled = reconcileLayout(rawLayout, prevSubPos.current);
    prevSubPos.current = new Map(reconciled.nodes.map((p) => [p.node.id, { x: p.x, y: p.y }]));
    return reconciled;
  }, [rawLayout, subgraphMode]);

  // Anchors: nodes matched across the step, with their position in the
  // previously rendered snapshot (old) and in this fresh layout (nu).
  const anchors = useMemo(() => {
    if (!stepContext?.prevPos?.size) return [];
    const out = [];
    for (const p of rawLayout.nodes) {
      const old = stepContext.prevPos.get(p.node.id);
      if (old) out.push({ old, nu: { x: p.x, y: p.y } });
    }
    return out;
  }, [rawLayout, stepContext]);

  // Fraction of visible nodes with a cross-step anchor — a pipeline
  // discontinuity (e.g. stream→hal) anchors almost nothing and should refit.
  const survivorRatio = useMemo(
    () => (rawLayout.nodes.length ? anchors.length / rawLayout.nodes.length : 0),
    [anchors, rawLayout]
  );

  // Camera anchoring: on arrival from an adjacent snapshot, pan by the
  // median displacement of matched nodes so the region under the viewport
  // stays put while the layout underneath is recomputed cleanly.
  const lastAnchoredStep = useRef(null);
  useEffect(() => {
    if (subgraphMode || !stepContext || stepContext === lastAnchoredStep.current) return;
    lastAnchoredStep.current = stepContext;
    if (!anchors.length || survivorRatio < 0.3) return;
    const median = (vals) => {
      const s = [...vals].sort((a, b) => a - b);
      return s[Math.floor(s.length / 2)];
    };
    const dx = median(anchors.map((a) => a.nu.x - a.old.x));
    const dy = median(anchors.map((a) => a.nu.y - a.old.y));
    const vs = viewState.current;
    vs.px -= dx * vs.z;
    vs.py -= dy * vs.z;
    requestRedraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepContext, anchors, survivorRatio, subgraphMode]);

  // Place ghosts by their structural classification so a removal reads as
  // what it was: a "replaced" ghost peeks out from behind its replacement,
  // a "bypassed" ghost sits beside the shortcut corridor with connectors
  // to its former producer/consumer, a "neighbor" ghost docks beside its
  // surviving neighbor. Only isolated removals (or missing targets) fall
  // back to spatial remapping through nearby anchors.
  //
  // Ghosts are not part of the layout, so they settle into free space via
  // a collision probe against both real nodes and already-placed ghosts —
  // several removals sharing one anchor fan out instead of stacking.
  // Connectors run border-to-border so they stay visible instead of
  // starting underneath the anchor node.
  const ghosts = useMemo(() => {
    const raw = stepContext?.ghosts;
    if (!raw?.length) return [];
    const nodeById = new Map(rawLayout.nodes.map((p) => [p.node.id, p]));

    // ── Collision infrastructure: coarse grid over nodes + placed ghosts ──
    const CELL = 300;
    const PAD = 8;
    const grid = new Map();
    const cellsOf = (r) => {
      const out = [];
      for (let cx = Math.floor(r.x / CELL); cx <= Math.floor((r.x + r.w) / CELL); cx++) {
        for (let cy = Math.floor(r.y / CELL); cy <= Math.floor((r.y + r.h) / CELL); cy++) {
          out.push(`${cx}_${cy}`);
        }
      }
      return out;
    };
    const insert = (r) => {
      for (const k of cellsOf(r)) {
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(r);
      }
    };
    const overlaps = (a, b) =>
      a.x - PAD < b.x + b.w &&
      a.x + a.w + PAD > b.x &&
      a.y - PAD < b.y + b.h &&
      a.y + a.h + PAD > b.y;
    const hits = (r, ignore) => {
      for (const k of cellsOf(r)) {
        for (const o of grid.get(k) || []) {
          if (o !== ignore && overlaps(r, o)) return true;
        }
      }
      return false;
    };
    for (const p of rawLayout.nodes) insert(p);

    // Probe offsets ordered by distance from the desired spot
    const OFFSETS = [[0, 0]];
    for (let ring = 1; ring <= 10; ring++) {
      for (const [mx, my] of [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
        OFFSETS.push([mx * 92 * ring, my * 64 * ring]);
      }
    }
    OFFSETS.sort((a, b) => a[0] ** 2 + a[1] ** 2 - (b[0] ** 2 + b[1] ** 2));
    const settle = (g, x, y, ignore = null) => {
      for (const [dx, dy] of OFFSETS) {
        const r = { x: x + dx, y: y + dy, w: g.w, h: g.h };
        if (!hits(r, ignore)) {
          insert(r);
          return r;
        }
      }
      const r = { x, y, w: g.w, h: g.h };
      insert(r);
      return r;
    };

    /** Point where the segment (rect center → toward) crosses the border. */
    const borderPoint = (r, tx, ty) => {
      const cx = r.x + r.w / 2;
      const cy = r.y + r.h / 2;
      const dx = tx - cx;
      const dy = ty - cy;
      if (!dx && !dy) return { x: cx, y: cy };
      const s = Math.min(
        dx ? r.w / 2 / Math.abs(dx) : Infinity,
        dy ? r.h / 2 / Math.abs(dy) : Infinity
      );
      return { x: cx + dx * s, y: cy + dy * s };
    };
    const connect = (from, to) => {
      const a = borderPoint(from, to.x + to.w / 2, to.y + to.h / 2);
      const b = borderPoint(to, from.x + from.w / 2, from.y + from.h / 2);
      return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
    };

    // Fallback: nearest-anchor delta remap of the OLD position (only
    // available when the previous snapshot's layout was captured at a
    // forward step). Returns null when unplaceable.
    const stride = Math.max(1, Math.floor(anchors.length / 2000));
    const pool = stride > 1 ? anchors.filter((_, i) => i % stride === 0) : anchors;
    const K = 3;
    const remapDesired = (g) => {
      if (g.oldX == null || !pool.length) return null;
      const best = [];
      for (const a of pool) {
        const d = (a.old.x - g.oldX) ** 2 + (a.old.y - g.oldY) ** 2;
        if (best.length < K) {
          best.push({ d, a });
        } else {
          let worst = 0;
          for (let i = 1; i < K; i++) if (best[i].d > best[worst].d) worst = i;
          if (d < best[worst].d) best[worst] = { d, a };
        }
      }
      let dx = 0;
      let dy = 0;
      for (const { a } of best) {
        dx += a.nu.x - a.old.x;
        dy += a.nu.y - a.old.y;
      }
      return { x: g.oldX + dx / best.length, y: g.oldY + dy / best.length };
    };

    // Ghosts on the same producer→consumer corridor spread along it
    const corridorOrder = new Map();
    // Ghosts docking on the same neighbor stack downward before probing
    const anchorCount = new Map();
    for (const g of raw) {
      if (g.kind !== "bypassed") continue;
      const key = `${g.producer}_${g.consumer}`;
      if (!corridorOrder.has(key)) corridorOrder.set(key, []);
      corridorOrder.get(key).push(g.id);
    }

    const placed = [];
    for (const g of raw) {
      const p = placeGhost(g);
      if (p) placed.push(p);
    }
    return placed;

    function placeGhost(g) {
      if (g.kind === "replaced") {
        const y = nodeById.get(g.replacedBy);
        if (y) {
          // Card peeking out behind the replacement node — overlap with
          // the replacement itself is the point, everything else probes.
          const r = settle(g, y.x + 14, y.y - 14, y);
          return { ...g, ...r, links: [] };
        }
      } else if (g.kind === "bypassed") {
        const p = nodeById.get(g.producer);
        const c = nodeById.get(g.consumer);
        if (p && c) {
          const group = corridorOrder.get(`${g.producer}_${g.consumer}`);
          const t = (group.indexOf(g.id) + 1) / (group.length + 1);
          const sx = p.x + p.w / 2;
          const sy = p.y + p.h;
          const ex = c.x + c.w / 2;
          const ey = c.y;
          const r = settle(
            g,
            sx + (ex - sx) * t + g.w * 0.75 - g.w / 2,
            sy + (ey - sy) * t - g.h / 2
          );
          return { ...g, ...r, links: [connect(p, r), connect(r, c)] };
        }
      } else if (g.kind === "neighbor") {
        const n = nodeById.get(g.anchorId);
        if (n) {
          const left = g.side === "consumer";
          const idx = anchorCount.get(g.anchorId) || 0;
          anchorCount.set(g.anchorId, idx + 1);
          const r = settle(
            g,
            left ? n.x - g.w - 30 : n.x + n.w + 30,
            n.y + (n.h - g.h) / 2 + idx * (g.h + 12)
          );
          return { ...g, ...r, links: [connect(n, r)] };
        }
      }
      const d = remapDesired(g);
      if (!d) return null;
      const r = settle(g, d.x, d.y);
      return { ...g, ...r, links: [] };
    }
  }, [stepContext, anchors, rawLayout]);

  // Report rendered positions so the parent can translate them through the
  // next pair's match when the user steps the timeline.
  useEffect(() => {
    if (!onLayoutRendered || subgraphMode) return;
    onLayoutRendered({
      idx: snapshotIdx,
      posById: new Map(layout.nodes.map((p) => [p.node.id, { x: p.x, y: p.y }])),
      layout,
    });
  }, [layout, snapshotIdx, subgraphMode, onLayoutRendered]);
  const spatialGrid = useMemo(() => buildSpatialGrid(layout.nodes), [layout]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const newW = Math.round(rect.width * dpr);
    const newH = Math.round(rect.height * dpr);

    // Only resize when dimensions actually changed (avoids GPU buffer realloc)
    if (canvas.width !== newW || canvas.height !== newH) {
      canvas.width = newW;
      canvas.height = newH;
    }

    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Clear
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, rect.width, rect.height);

    // Apply transform
    const vs = viewState.current;
    ctx.save();
    ctx.translate(vs.px, vs.py);
    ctx.scale(vs.z, vs.z);

    // Grid
    drawGrid(ctx, { x: vs.px, y: vs.py }, vs.z, rect.width, rect.height);

    // Compute viewport in world coordinates for culling
    const viewport = {
      x1: -vs.px / vs.z,
      y1: -vs.py / vs.z,
      x2: (rect.width - vs.px) / vs.z,
      y2: (rect.height - vs.py) / vs.z,
    };

    // Compute highlight state
    const { primary, related } = getHighlightedNodeSets(hiVals, graph);

    // Draw loc group boxes (behind everything), then ghosts, edges, nodes,
    // then pass-diff rings and probe halos on top
    if (locGrouping && layout.locGroups) {
      drawLocGroups(ctx, layout.locGroups, viewport, vs.z);
    }
    if (!subgraphMode && ghosts.length) {
      drawGhostNodes(ctx, ghosts, viewport, vs.z, hiGhostId);
    }
    drawEdges(ctx, layout, hiVals, primary, related, viewport, vs.z);
    drawNodes(ctx, layout, hiVals, primary, related, viewport, vs.z);
    if (!subgraphMode && (stepContext?.diff || probeHalos?.size)) {
      drawOverlays(
        ctx,
        layout,
        { diff: stepContext?.diff, probeHalos },
        viewport,
        vs.z
      );
    }

    ctx.restore();
  }, [layout, hiVals, graph, locGrouping, registry, subgraphMode, stepContext, ghosts, hiGhostId, probeHalos]);

  /** Schedule a single RAF-throttled redraw. */
  const requestRedraw = useCallback(() => {
    if (dirty.current) return;
    dirty.current = true;
    rafId.current = requestAnimationFrame(() => {
      dirty.current = false;
      draw();
    });
  }, [draw]);

  // Cleanup RAF on unmount
  useEffect(() => {
    return () => {
      if (rafId.current) cancelAnimationFrame(rafId.current);
    };
  }, []);

  // Redraw when dependencies change
  useEffect(() => { draw(); }, [draw]);

  // Resize observer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => requestRedraw());
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [requestRedraw]);

  // On layout change: if there's a selection, focus on it; otherwise fit-to-view.
  // In subgraph mode the key is constant: fit once on entry, then keep the
  // camera still while the user grows/shrinks the trace — reconcileLayout
  // pins existing nodes, so nothing on screen should move.
  const prevLayoutKey = useRef(null);
  useEffect(() => {
    // In a snapshot series the camera holds still while enough nodes
    // survive the step (they're pinned in place); a discontinuity refits.
    if (!subgraphMode && stepContext && survivorRatio >= 0.3) {
      prevLayoutKey.current = `pipeline_hold_${showAux}_${locGrouping}`;
      return;
    }
    const key = subgraphMode
      ? "subgraph"
      : stepContext
        ? `pipeline_${snapshotIdx}_${showAux}_${locGrouping}`
        : `${layout.nodes.length}_${layout.edges.length}_${showAux}_${locGrouping}`;
    if (prevLayoutKey.current === key) return;
    prevLayoutKey.current = key;
    if (!subgraphMode && hiVals.length > 0) {
      focusSelected();
    } else {
      fitToView();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, showAux, locGrouping, subgraphMode, stepContext, survivorRatio, snapshotIdx]);

  function fitToView() {
    const canvas = canvasRef.current;
    if (!canvas || !layout.w) return;
    const rect = canvas.getBoundingClientRect();
    const vs = viewState.current;
    const sx = (rect.width - 60) / (layout.w || 1);
    const sy = (rect.height - 60) / (layout.h || 1);
    vs.z = Math.min(sx, sy, 3);
    // x0/y0: bounding-box offset from reconciled subgraph layouts (0 for
    // fresh layouts, whose content starts at the origin)
    vs.px = (rect.width - layout.w * vs.z) / 2 - (layout.x0 || 0) * vs.z;
    vs.py = Math.max(20, (rect.height - layout.h * vs.z) / 2) - (layout.y0 || 0) * vs.z;
    setTimeout(() => { draw(); setTick((t) => t + 1); }, 50);
  }

  function focusSelected() {
    const canvas = canvasRef.current;
    if (!canvas || !hiVals.length) return;
    const { primary, related } = getHighlightedNodeSets(hiVals, graph);
    if (!primary.size) return;
    // Include both primary and related nodes in the focus bounding box
    const allHi = new Set([...primary, ...related]);
    const selNodes = layout.nodes.filter((n) => allHi.has(n.node.id));
    if (!selNodes.length) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of selNodes) {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + n.w);
      maxY = Math.max(maxY, n.y + n.h);
    }
    const bw = maxX - minX;
    const bh = maxY - minY;
    const rect = canvas.getBoundingClientRect();
    const pad = 120;
    const vs = viewState.current;
    const sx = (rect.width - pad) / (bw || 1);
    const sy = (rect.height - pad) / (bh || 1);
    vs.z = Math.min(sx, sy, 3);
    vs.px = (rect.width - bw * vs.z) / 2 - minX * vs.z;
    vs.py = (rect.height - bh * vs.z) / 2 - minY * vs.z;
    requestRedraw();
    setTick((t) => t + 1);
  }

  // ── Interaction handlers ──

  function getCanvasPos(e) {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function handleWheel(e) {
    e.preventDefault();
    const vs = viewState.current;
    const pos = getCanvasPos(e);
    const factor = e.deltaY < 0 ? 1.12 : 0.89;
    const newZoom = Math.max(0.03, Math.min(10, vs.z * factor));
    vs.px = pos.x - (pos.x - vs.px) * (newZoom / vs.z);
    vs.py = pos.y - (pos.y - vs.py) * (newZoom / vs.z);
    vs.z = newZoom;
    requestRedraw();
    setTick((t) => t + 1);
  }

  function handleMouseDown(e) {
    const vs = viewState.current;
    const pos = getCanvasPos(e);
    const worldX = (pos.x - vs.px) / vs.z;
    const worldY = (pos.y - vs.py) / vs.z;

    // Hit test via spatial index — pick smallest (most specific) node
    const candidates = spatialGrid.query(worldX, worldY);
    let best = null;
    let bestArea = Infinity;
    for (const node of candidates) {
      if (
        worldX >= node.x &&
        worldX <= node.x + node.w &&
        worldY >= node.y &&
        worldY <= node.y + node.h
      ) {
        const area = node.w * node.h;
        if (area < bestArea) {
          best = node;
          bestArea = area;
        }
      }
    }
    if (best) {
      if (best.node.results.length > 0) {
        onValClick(best.node.results[0]);
      }
      return; // don't start drag
    }

    // Start panning
    vs.drag = true;
    vs.lx = pos.x;
    vs.ly = pos.y;
  }

  function handleMouseMove(e) {
    const vs = viewState.current;
    if (!vs.drag) return;
    const pos = getCanvasPos(e);
    vs.px += pos.x - vs.lx;
    vs.py += pos.y - vs.ly;
    vs.lx = pos.x;
    vs.ly = pos.y;
    requestRedraw();
  }

  function handleMouseUp() {
    viewState.current.drag = false;
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Toolbar */}
      <div
        style={{
          padding: "6px 10px",
          display: "flex",
          gap: 6,
          alignItems: "center",
          borderBottom: `1px solid ${C.border}`,
          background: C.panel,
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase", color: C.dim }}>
          Graph
        </span>
        <span style={{ fontSize: 10, color: subgraphMode ? C.accent : C.dim }}>
          {subgraphMode ? "subgraph · " : ""}{layout.nodes.length} nodes · {layout.edges.length} edges
        </span>
        <button
          onClick={() => setShowAux((v) => !v)}
          style={{
            ...toolbarBtn,
            background: showAux ? C.border : C.surface,
          }}
          title="Toggle auxiliary ops (constants, empties, broadcasts, etc.)"
        >
          {showAux ? "aux ops shown" : "aux ops collapsed"}
        </button>
        <button
          onClick={() => setLocGrouping((v) => !v)}
          style={{
            ...toolbarBtn,
            background: locGrouping ? C.border : C.surface,
          }}
          title="Group nodes by location trace"
        >
          {locGrouping ? "loc groups on" : "loc groups off"}
        </button>
        <div style={{ marginLeft: "auto", display: "flex", gap: 4, alignItems: "center" }}>
          <button
            onClick={() => { viewState.current.z = Math.min(10, viewState.current.z * 1.3); requestRedraw(); setTick((t) => t + 1); }}
            style={toolbarBtn}
          >
            +
          </button>
          <button
            onClick={() => { viewState.current.z = Math.max(0.03, viewState.current.z / 1.3); requestRedraw(); setTick((t) => t + 1); }}
            style={toolbarBtn}
          >
            −
          </button>
          <span style={{ fontSize: 9, color: C.dim, minWidth: 32, textAlign: "center" }}>
            {Math.round(viewState.current.z * 100)}%
          </span>
          <button onClick={() => fitToView()} style={toolbarBtn}>
            Fit
          </button>
          <button
            onClick={() => focusSelected()}
            disabled={!hiVals.length}
            style={{
              ...toolbarBtn,
              opacity: hiVals.length ? 1 : 0.35,
              cursor: hiVals.length ? "pointer" : "default",
            }}
            title="Zoom to selected nodes"
          >
            Focus
          </button>
          <button
            onClick={() => setSubgraphMode((v) => !v)}
            disabled={!subgraphMode && !hiVals.length}
            style={{
              ...toolbarBtn,
              background: subgraphMode ? C.accent + "22" : C.surface,
              color: subgraphMode ? C.accent : C.dim,
              borderColor: subgraphMode ? C.accent + "55" : C.border,
              opacity: subgraphMode || hiVals.length ? 1 : 0.35,
              cursor: subgraphMode || hiVals.length ? "pointer" : "default",
            }}
            title="Show only selected nodes and their neighbors, re-laid out as their own graph"
          >
            Subgraph
          </button>
        </div>
      </div>

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{ flex: 1, width: "100%", cursor: "grab", display: "block" }}
      />

      {/* Status bar */}
      <div
        style={{
          padding: "4px 10px",
          fontSize: 9,
          color: C.dim,
          background: C.panel,
          borderTop: `1px solid ${C.border}`,
          flexShrink: 0,
        }}
      >
        {subgraphMode
          ? "Subgraph mode — click nodes to grow or shrink the trace · Subgraph button returns to full graph"
          : "Scroll to zoom · Drag to pan · Click node to highlight dataflow"}
      </div>
    </div>
  );
}
