/**
 * Canvas Renderer
 *
 * Pure rendering functions that draw the graph onto a 2D canvas context.
 * Separated from React so the drawing logic is testable and reusable.
 */

import { colors, fonts, getDialectColor, getLocColor } from "../utils/theme.js";
import { getActiveRegistry } from "../extensions/registry.js";

const M = fonts.mono;

/** Draw a rounded rectangle path (does not fill or stroke). */
export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function truncate(s, max) {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

function shortLabel(op) {
  if (op.attrs.name) {
    const nm = op.attrs.name;
    return nm.length > 20 ? nm.slice(0, 18) + "…" : nm;
  }
  const dot = op.opName.indexOf(".");
  return dot > 0 ? op.opName.slice(dot + 1) : op.opName;
}

/**
 * Draw the background grid.
 */
export function drawGrid(ctx, pan, zoom, canvasW, canvasH) {
  const gridSize = 50;
  ctx.strokeStyle = "#252b3a";
  ctx.lineWidth = 0.5 / zoom;

  const sx = -pan.x / zoom;
  const sy = -pan.y / zoom;
  const ex = (canvasW - pan.x) / zoom;
  const ey = (canvasH - pan.y) / zoom;

  for (let x = Math.floor(sx / gridSize) * gridSize; x < ex; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, sy);
    ctx.lineTo(x, ey);
    ctx.stroke();
  }
  for (let y = Math.floor(sy / gridSize) * gridSize; y < ey; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(sx, y);
    ctx.lineTo(ex, y);
    ctx.stroke();
  }
}

/**
 * Draw all edges using waypoint-based smooth curves.
 * Highlighted edges are drawn on top with a brighter color.
 */
export function drawEdges(ctx, layout, highlightedValues, primaryNodes, relatedNodes, viewport, zoom) {
  const hiSet = new Set(highlightedValues);

  // An edge is "related-highlighted" if it connects a related node to a primary node
  const isRelatedEdge = (e) =>
    (primaryNodes.has(e.to) && relatedNodes.has(e.from)) ||
    (primaryNodes.has(e.from) && relatedNodes.has(e.to));

  // Partition edges: normal first, then related, then primary highlighted on top
  const normalEdges = [];
  const relatedEdges = [];
  const highlightedEdges = [];
  for (const e of layout.edges) {
    if (hiSet.has(e.value)) highlightedEdges.push(e);
    else if (isRelatedEdge(e)) relatedEdges.push(e);
    else normalEdges.push(e);
  }

  const lod = zoom < 0.3 ? "minimal" : "full";
  const allEdges = normalEdges.concat(relatedEdges, highlightedEdges);
  const labeledValues = new Set(); // deduplicate: one label per value

  for (const e of allEdges) {
    const pts = e.points;
    if (!pts || pts.length < 2) continue;

    const isHi = hiSet.has(e.value);
    const isRel = !isHi && isRelatedEdge(e);

    // Viewport culling using bounding box of all waypoints
    if (viewport) {
      const pad = 40;
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const p of pts) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }
      if (maxX + pad < viewport.x1 || minX - pad > viewport.x2 ||
          maxY < viewport.y1 || minY > viewport.y2) continue;
    }

    ctx.beginPath();

    if (pts.length === 2) {
      // Simple 2-point edge: adaptive bezier
      const dy = Math.abs(pts[1].y - pts[0].y);
      const dx = Math.abs(pts[1].x - pts[0].x);
      const tension = Math.min(0.45, 0.2 + 0.25 * (1 - dx / (dx + dy + 1)));
      ctx.moveTo(pts[0].x, pts[0].y);
      ctx.bezierCurveTo(
        pts[0].x, pts[0].y + dy * tension,
        pts[1].x, pts[1].y - dy * tension,
        pts[1].x, pts[1].y
      );
    } else {
      // Multi-point edge: piecewise cubic bezier through waypoints
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[i];
        const p1 = pts[i + 1];
        const dy = p1.y - p0.y;
        ctx.bezierCurveTo(
          p0.x, p0.y + dy * 0.4,
          p1.x, p1.y - dy * 0.4,
          p1.x, p1.y
        );
      }
    }

    ctx.strokeStyle = isHi ? "#7cafff" : isRel ? "#5e9de8" : "#506a8e";
    // At low zoom, boost highlighted/related edges so they stand out from normal ones
    const minLw = isHi ? 1.5 / zoom : isRel ? 1.2 / zoom : 0.5 / zoom;
    const edgeLw = isHi ? 2.5 : isRel ? 2.2 : 1.4;
    ctx.lineWidth = Math.max(edgeLw, minLw);
    ctx.setLineDash([]);
    ctx.stroke();

    // Skip arrowheads and labels at minimal LOD
    if (lod === "minimal") continue;

    // Arrowhead at last point
    const last = pts[pts.length - 1];
    const arrowSize = isHi ? 5 : isRel ? 4.5 : 3;
    ctx.beginPath();
    ctx.moveTo(last.x - arrowSize, last.y - arrowSize * 1.6);
    ctx.lineTo(last.x, last.y - 1);
    ctx.lineTo(last.x + arrowSize, last.y - arrowSize * 1.6);
    ctx.fillStyle = isHi ? "#7cafff" : isRel ? "#5e9de8" : "#506a8e";
    ctx.fill();

    // Value label on highlighted edges (one label per unique value)
    if (isHi && !labeledValues.has(e.value)) {
      labeledValues.add(e.value);
      ctx.font = `bold 8px ${M}`;
      // Place label near the source node (20% down the first segment) to keep it visible
      const labelT = 0.2;
      const labelX = pts[0].x * (1 - labelT) + pts[1].x * labelT + 20;
      const labelY = pts[0].y * (1 - labelT) + pts[1].y * labelT;
      // Background pill for readability
      const tw = ctx.measureText(e.value).width;
      const px = 4, py = 3;
      ctx.fillStyle = "rgba(10, 15, 25, 0.85)";
      roundRect(ctx, labelX - tw / 2 - px, labelY - 8 - py, tw + px * 2, 10 + py * 2, 3);
      ctx.fill();
      ctx.fillStyle = "#8ec4ff";
      ctx.textAlign = "center";
      ctx.fillText(e.value, labelX, labelY);
    }
  }
}

/**
 * Draw all nodes with dialect-colored accents, labels, and type info.
 * LOD tiers: minimal (zoom < 0.3), reduced (zoom < 0.6), full.
 */
export function drawNodes(ctx, layout, highlightedValues, primaryNodes, relatedNodes, viewport, zoom) {
  const lod = zoom < 0.3 ? "minimal" : zoom < 0.6 ? "reduced" : "full";

  for (const p of layout.nodes) {
    // Viewport culling: skip nodes entirely off-screen
    if (viewport && (
      p.x + p.w < viewport.x1 ||
      p.x > viewport.x2 ||
      p.y + p.h < viewport.y1 ||
      p.y > viewport.y2
    )) continue;

    const op = p.node;
    const col = getDialectColor(op.dialect);
    const isPrimary = primaryNodes.has(op.id);
    const isRelated = relatedNodes.has(op.id);

    // ── Auxiliary mini-node ──
    if (p.isAux) {
      const auxAlpha = isPrimary ? 0.85 : isRelated ? 0.75 : 0.45;
      ctx.globalAlpha = auxAlpha;

      // Background
      ctx.fillStyle = isPrimary ? col + "20" : isRelated ? "#1c2538" : "#181e2c";
      roundRect(ctx, p.x, p.y, p.w, p.h, 5);
      ctx.fill();

      // Border — dashed for aux
      ctx.strokeStyle = isPrimary ? col : isRelated ? col + "99" : "#3a4760";
      ctx.lineWidth = isPrimary ? 1.5 : isRelated ? 1.2 : 0.8;
      ctx.setLineDash([3, 2]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Left accent bar (thinner)
      ctx.fillStyle = col;
      ctx.fillRect(p.x + 1, p.y + 5, 2.5, p.h - 10);

      // Label — scaled by LOD
      const auxFontSize = lod === "minimal" ? 12 : 9;
      ctx.font = `${auxFontSize}px ${M}`;
      ctx.fillStyle = isPrimary ? "#ddd" : isRelated ? "#dde4ee" : col + "cc";
      ctx.textAlign = "left";
      ctx.fillText(truncate(shortLabel(op), lod === "minimal" ? 10 : 15), p.x + 8, p.y + p.h / 2 + (lod === "minimal" ? 4 : 3));

      ctx.globalAlpha = 1;
      continue;
    }

    // Purpose label from the active profiles (e.g. linalg.generic → "ReLU/max").
    // Cached on the op: at minimal LOD every node is visible every frame, and
    // single-dialect imports (Caffe) would otherwise all collapse to one
    // dialect color when zoomed out. Ops are re-created on any reparse
    // (including profile changes), so the cache cannot go stale.
    if (op._summary === undefined) {
      op._summary = getActiveRegistry().summarize(op) || null;
    }
    const summary = op._summary;
    const nodeColor = summary ? summary.color : col;

    // ── Minimal LOD: filled rectangle with large label ──
    if (lod === "minimal") {
      // Tinted background using dialect color
      ctx.fillStyle = isPrimary ? nodeColor + "40" : isRelated ? nodeColor + "28" : nodeColor + "18";
      roundRect(ctx, p.x, p.y, p.w, p.h, 8);
      ctx.fill();
      ctx.strokeStyle = isPrimary ? nodeColor : isRelated ? nodeColor + "aa" : nodeColor + "55";
      ctx.lineWidth = isPrimary ? 2.5 : isRelated ? 1.5 : 1;
      ctx.stroke();
      // Accent bar
      ctx.fillStyle = nodeColor;
      ctx.globalAlpha = isPrimary ? 1 : isRelated ? 1 : 0.8;
      ctx.fillRect(p.x + 1, p.y + 6, isPrimary ? 4.5 : 3.5, p.h - 12);
      ctx.globalAlpha = 1;
      // Large label — sized to fill the node
      ctx.font = `600 16px ${M}`;
      ctx.fillStyle = isPrimary ? "#fff" : isRelated ? "#d0dae8" : nodeColor + "cc";
      ctx.textAlign = "left";
      ctx.fillText(truncate(shortLabel(op), 12), p.x + 10, p.y + p.h / 2 + 6);
      continue;
    }

    const fullNodeColor = summary ? summary.color : col;

    // Drop shadow
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    roundRect(ctx, p.x + 2, p.y + 2, p.w, p.h, 8);
    ctx.fill();

    // Background — primary gets a colored tint to clearly stand out
    if (isPrimary) {
      ctx.fillStyle = fullNodeColor + "20";
    } else if (isRelated) {
      ctx.fillStyle = "#1c2538";
    } else {
      ctx.fillStyle = "#1a2030";
    }
    roundRect(ctx, p.x, p.y, p.w, p.h, 8);
    ctx.fill();

    // Border
    ctx.strokeStyle = isPrimary ? fullNodeColor : isRelated ? fullNodeColor + "99" : "#3d4e68";
    ctx.lineWidth = isPrimary ? 2.5 : isRelated ? 1.5 : 1;
    ctx.stroke();

    // Left accent bar
    ctx.fillStyle = fullNodeColor;
    ctx.globalAlpha = isPrimary ? 1 : isRelated ? 1 : 0.8;
    ctx.fillRect(p.x + 1, p.y + 10, isPrimary ? 4.5 : 3.5, p.h - 20);
    ctx.globalAlpha = 1;

    // Op name — bigger at reduced LOD to fill the node
    const nameSize = lod === "reduced" ? 14 : 10.5;
    ctx.font = `600 ${nameSize}px ${M}`;
    ctx.fillStyle = isPrimary ? "#fff" : isRelated ? "#c8d4e4" : fullNodeColor;
    ctx.textAlign = "left";
    const label = summary
      ? `${summary.icon} ${summary.label}`
      : shortLabel(op);
    const nameY = lod === "reduced" ? p.y + 22 : p.y + 18;
    ctx.fillText(truncate(label, lod === "reduced" ? 16 : 22), p.x + 11, nameY);

    // ── Reduced LOD: show SSA value then stop ──
    if (lod === "reduced") {
      if (op.results.length > 0) {
        ctx.font = `11px ${M}`;
        ctx.fillStyle = "#7a9ac0";
        const displayResults = op.rawResults || op.results;
        ctx.fillText(displayResults.join(", "), p.x + 11, p.y + 40);
      }
      continue;
    }

    // SSA result value(s)
    if (op.results.length > 0) {
      ctx.font = `9px ${M}`;
      const anyHighlighted = op.results.some((r) => highlightedValues.includes(r));
      ctx.fillStyle = anyHighlighted ? "#8ec0ff" : "#7a9ac0";
      const displayResults = op.rawResults || op.results;
      ctx.fillText(displayResults.join(", "), p.x + 11, p.y + 32);
    }

    // Type on right side
    if (op.types.length > 0) {
      ctx.font = `8px ${M}`;
      ctx.fillStyle = "#5a7a9e";
      ctx.textAlign = "right";
      ctx.fillText(
        truncate(op.types[op.types.length - 1], 20),
        p.x + p.w - 8,
        p.y + 32
      );
      ctx.textAlign = "left";
    }

    // Dialect badge in top-right
    ctx.font = `bold 7px ${M}`;
    ctx.fillStyle = fullNodeColor + "77";
    ctx.textAlign = "right";
    ctx.fillText(op.dialect, p.x + p.w - 8, p.y + 15);
    ctx.textAlign = "left";

    // Op-name sub-label when a purpose label replaced it above
    if (summary) {
      ctx.font = `8px ${M}`;
      ctx.fillStyle = colors.pink + "66";
      ctx.fillText(op.opName, p.x + 11, p.y + 43);
    }
  }
}

/** Draw location group background boxes behind nodes (nested hierarchy). */
export function drawLocGroups(ctx, locGroups, viewport, zoom) {
  if (!locGroups || locGroups.length === 0) return;

  for (const g of locGroups) {
    // Viewport culling
    if (
      g.x + g.w < viewport.x1 || g.x > viewport.x2 ||
      g.y + g.h < viewport.y1 || g.y > viewport.y2
    ) continue;

    const color = getLocColor(g.loc);
    const d = g.depth; // 0=outer, 1=middle, 2=leaf

    // Background fill — leaf boxes most visible
    const fillAlpha = d === 0 ? "0a" : d === 1 ? "0c" : "14";
    ctx.fillStyle = color + fillAlpha;
    const r = d === 0 ? 16 : d === 1 ? 10 : 6;
    roundRect(ctx, g.x, g.y, g.w, g.h, r);
    ctx.fill();

    // Border — outer light, middle dashed, leaf solid + prominent
    const borderAlpha = d === 0 ? "30" : d === 1 ? "25" : "55";
    ctx.strokeStyle = color + borderAlpha;
    ctx.lineWidth = d === 2 ? 2 : d === 0 ? 1.5 : 1;
    if (d === 1) ctx.setLineDash([5, 3]);
    roundRect(ctx, g.x, g.y, g.w, g.h, r);
    ctx.stroke();
    ctx.setLineDash([]);

    // Label with background banner — scales inversely with zoom
    // Leaf labels show the last path segment (the op name), others show full loc
    const label = d === 2
      ? g.loc.split("/").filter(Boolean).slice(-2).join("/")
      : g.loc;
    const baseSize = d === 0 ? 14 : d === 1 ? 11 : 10;
    const fontSize = Math.max(baseSize, Math.min(48, baseSize / zoom));
    ctx.font = `${d === 2 ? 600 : 700} ${fontSize}px ${M}`;
    const textW = ctx.measureText(label).width;
    const bannerH = fontSize + 4;
    const bannerW = textW + 12;
    const bx = g.x;
    const by = g.y;

    // Banner background
    const bannerAlpha = d === 0 ? "22" : d === 1 ? "1a" : "33";
    ctx.fillStyle = color + bannerAlpha;
    roundRect(ctx, bx, by, bannerW, bannerH, r > 6 ? r : 6);
    ctx.fill();

    // Label text
    const textAlpha = d === 0 ? "cc" : d === 1 ? "aa" : "ee";
    ctx.fillStyle = color + textAlpha;
    ctx.textAlign = "left";
    ctx.fillText(label, bx + 6, by + fontSize);
  }
}

/**
 * Draw ghost rects for ops eliminated by the current pass, placed by their
 * structural classification. Non-interactive (not in the spatial index);
 * drawn beneath edges and nodes, so a "replaced" ghost peeks out from
 * behind its replacement like a discarded card.
 *   replaced (orange) — something new took this op's place
 *   otherwise (red)   — bypassed / dropped; `links` are dashed connectors
 *                       to the mapped producer/consumer or neighbor
 * @param {Array<{x,y,w,h,opName,kind,links,isAux}>} ghosts
 */
export function drawGhostNodes(ctx, ghosts, viewport, zoom, highlightId = null) {
  if (!ghosts?.length) return;
  const lod = zoom < 0.3 ? "minimal" : "full";
  const s = Math.max(1, 1 / zoom); // keep strokes ≥1px on screen at low zoom
  for (const g of ghosts) {
    if (viewport && (
      g.x + g.w < viewport.x1 ||
      g.x > viewport.x2 ||
      g.y + g.h < viewport.y1 ||
      g.y > viewport.y2
    )) continue;
    const col = g.kind === "replaced" ? colors.orange : colors.red;
    const hi = g.id === highlightId;

    // Connectors to the surviving neighbors this removal relates to
    // (border-to-border, so they don't start hidden under the anchor node)
    if (g.links?.length) {
      ctx.globalAlpha = hi ? 0.9 : 0.55;
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.2 * s;
      ctx.setLineDash([3, 4]);
      for (const l of g.links) {
        ctx.beginPath();
        ctx.moveTo(l.x1, l.y1);
        ctx.lineTo(l.x2, l.y2);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }

    ctx.globalAlpha = hi ? 0.95 : 0.4;
    ctx.fillStyle = col + (hi ? "26" : "14");
    roundRect(ctx, g.x, g.y, g.w, g.h, g.isAux ? 5 : 8);
    ctx.fill();
    ctx.strokeStyle = hi ? col : col + "88";
    ctx.lineWidth = (hi ? 2 : 1) * s;
    ctx.setLineDash([4, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
    if (lod !== "minimal") {
      ctx.font = `9px ${M}`;
      ctx.fillStyle = col + (hi ? "ee" : "bb");
      ctx.textAlign = "left";
      ctx.fillText(truncate(g.opName || "", 20), g.x + 8, g.y + g.h / 2 + 3);
    }
    ctx.globalAlpha = 1;
  }
}

/** Diff/probe overlay colors, keyed by change kind. */
const DIFF_STYLE = {
  added: { color: colors.green, glyph: "+" },
  changed: { color: colors.yellow, glyph: "~" },
  split: { color: colors.purple, glyph: "1→n" },
  merged: { color: colors.purple, glyph: "n→1" },
};

/**
 * Draw pass-diff rings and probe halos on top of already-drawn nodes.
 * @param {Object} overlay {diff: {added,changed,split,merged: Set<opId>},
 *                          probeHalos: Map<opId, colorString>}
 */
export function drawOverlays(ctx, layout, overlay, viewport, zoom) {
  if (!overlay) return;
  const { diff, probeHalos } = overlay;
  const showBadge = zoom >= 0.45;
  // Rings are drawn in world units — compensate at low zoom so the
  // changed/added auras stay visible on a fully zoomed-out graph
  const s = Math.max(1, 1 / zoom);
  for (const p of layout.nodes) {
    if (viewport && (
      p.x + p.w < viewport.x1 ||
      p.x > viewport.x2 ||
      p.y + p.h < viewport.y1 ||
      p.y > viewport.y2
    )) continue;
    const id = p.node.id;

    // Probe halo: soft outer ring in the probe's color, outside the diff ring
    const haloColor = probeHalos?.get(id);
    if (haloColor) {
      ctx.strokeStyle = haloColor + "66";
      ctx.lineWidth = 6 * s;
      roundRect(ctx, p.x - 5 * s, p.y - 5 * s, p.w + 10 * s, p.h + 10 * s, 11);
      ctx.stroke();
      ctx.strokeStyle = haloColor;
      ctx.lineWidth = 1.5 * s;
      ctx.stroke();
    }

    if (diff) {
      let kind = null;
      if (diff.added.has(id)) kind = "added";
      else if (diff.split.has(id)) kind = "split";
      else if (diff.merged.has(id)) kind = "merged";
      else if (diff.changed.has(id)) kind = "changed";
      if (kind) {
        const { color, glyph } = DIFF_STYLE[kind];
        ctx.strokeStyle = color + "55";
        ctx.lineWidth = 4 * s;
        roundRect(ctx, p.x - 2 * s, p.y - 2 * s, p.w + 4 * s, p.h + 4 * s, 9);
        ctx.stroke();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5 * s;
        ctx.stroke();
        if (showBadge) {
          const bw = glyph.length > 1 ? 26 : 14;
          ctx.fillStyle = color;
          roundRect(ctx, p.x + p.w - bw + 4, p.y - 7, bw, 13, 4);
          ctx.fill();
          ctx.font = `700 8px ${M}`;
          ctx.fillStyle = "#0b0e14";
          ctx.textAlign = "center";
          ctx.fillText(glyph, p.x + p.w - bw / 2 + 4, p.y + 2.5);
          ctx.textAlign = "left";
        }
      }
    }
  }
}
