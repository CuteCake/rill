/**
 * Timeline — pass-pipeline strip shown when a snapshot series is loaded.
 * One chip per snapshot, step buttons, per-pair diff badges, and the
 * Track / Link / Session controls.
 *
 * Passes whose incoming pair produced no visible diff collapse into
 * "⋯ n same" pills (a 100-pass dump usually has ~10 real changes);
 * clicking a pill expands that run temporarily.
 */

import { useEffect, useState } from "react";
import { colors, fonts } from "../utils/theme.js";

const C = colors;
export const TIMELINE_HEIGHT = 34;

/** "module.5.dispatch-creation.mlir" → "5 dispatch-creation" */
export function chipLabel(name) {
  const base = name.replace(/\.[^.]+$/, "");
  const m = base.match(/^module\.(\d+)\.(.+)$/);
  if (m) return `${m[1]} ${m[2]}`;
  return base.length > 18 ? base.slice(0, 17) + "…" : base;
}

const btn = {
  padding: "2px 7px",
  borderRadius: 3,
  border: `1px solid ${C.border}`,
  background: C.surface,
  color: C.dim,
  fontSize: 10,
  cursor: "pointer",
  lineHeight: "16px",
  flexShrink: 0,
};

export default function Timeline({
  snapshots,          // [{name, missing?}]
  activeIdx,
  onSelect,
  onStep,             // (dir) → step to the next/prev visible chip
  badges,             // per-pair: {added, removed, changed} | null
  chipVisible,        // boolean[] — collapse state per chip (App-computed)
  hideUnchanged,
  onToggleHideUnchanged,
  unchangedCount,     // pairs classified as no-visible-diff
  scan,               // {done, total} | null — background matching progress
  canTrack,
  onTrack,
  linkState,          // null | {fromIdx, count}
  canLink,
  canConfirmLink,
  onLinkStart,
  onLinkConfirm,
  onLinkCancel,
  onSessionSave,
}) {
  const [expanded, setExpanded] = useState(() => new Set());
  useEffect(() => setExpanded(new Set()), [snapshots.length]);

  const badgeText = (b) =>
    b ? `+${b.added} −${b.removed} ~${b.changed}` : null;

  // Group consecutive collapsed chips into pills
  const items = [];
  {
    let i = 0;
    while (i < snapshots.length) {
      if (chipVisible[i]) {
        items.push({ type: "chip", i, dim: false });
        i++;
        continue;
      }
      const start = i;
      while (i < snapshots.length && !chipVisible[i]) i++;
      if (expanded.has(start)) {
        for (let j = start; j < i; j++) items.push({ type: "chip", i: j, dim: true });
      } else {
        items.push({ type: "pill", start, count: i - start });
      }
    }
  }

  const renderChip = ({ i, dim }) => {
    const s = snapshots[i];
    const active = i === activeIdx;
    const isLinkSource = linkState && linkState.fromIdx === i;
    return (
      <button
        key={`c${i}`}
        onClick={() => onSelect(i)}
        title={s.name + (s.missing ? " (missing — attach the file)" : "")}
        style={{
          ...btn,
          border: `1px solid ${isLinkSource ? C.cyan : active ? C.accent : C.border}`,
          background: active ? C.accent + "1c" : C.surface,
          color: s.missing ? C.dim + "88" : active ? C.accent : dim ? C.dim : C.text,
          fontWeight: active ? 700 : 400,
          opacity: dim && !active ? 0.7 : 1,
          display: "flex",
          gap: 5,
          alignItems: "center",
          whiteSpace: "nowrap",
        }}
      >
        {chipLabel(s.name)}
        {i > 0 && badges?.[i - 1] && (
          <span
            title={`What this pass did: ${badges[i - 1].added} ops added, ${badges[i - 1].removed} removed, ${badges[i - 1].changed} changed`}
            style={{ fontSize: 8, color: active ? C.accent : C.dim, fontFamily: fonts.mono }}
          >
            {badgeText(badges[i - 1])}
          </span>
        )}
      </button>
    );
  };

  return (
    <div
      style={{
        height: TIMELINE_HEIGHT,
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "0 10px",
        background: C.panel,
        borderBottom: `1px solid ${C.border}`,
        fontFamily: fonts.ui,
      }}
    >
      <button
        onClick={() => onStep(-1)}
        disabled={activeIdx === 0}
        style={{ ...btn, opacity: activeIdx === 0 ? 0.35 : 1 }}
        title="Previous changed pass  ( [ )"
      >
        ‹
      </button>
      <button
        onClick={() => onStep(1)}
        disabled={activeIdx === snapshots.length - 1}
        style={{ ...btn, opacity: activeIdx === snapshots.length - 1 ? 0.35 : 1 }}
        title="Next changed pass  ( ] )"
      >
        ›
      </button>
      <span style={{ fontSize: 9, color: C.dim, flexShrink: 0, minWidth: 34 }}>
        {activeIdx + 1}/{snapshots.length}
      </span>

      {/* Chips + collapsed-run pills */}
      <div
        style={{
          display: "flex",
          gap: 3,
          overflowX: "auto",
          flex: 1,
          alignItems: "center",
          scrollbarWidth: "thin",
        }}
      >
        {items.map((it) =>
          it.type === "chip" ? (
            renderChip(it)
          ) : (
            <button
              key={`p${it.start}`}
              onClick={() =>
                setExpanded((prev) => new Set(prev).add(it.start))
              }
              title={`${it.count} pass${it.count > 1 ? "es" : ""} with no visible changes — click to expand`}
              style={{
                ...btn,
                borderStyle: "dashed",
                color: C.dim,
                fontStyle: "italic",
                whiteSpace: "nowrap",
              }}
            >
              ⋯ {it.count} same
            </button>
          )
        )}
      </div>

      {/* Background matching progress + collapse toggle */}
      {scan && scan.done < scan.total && (
        <span style={{ fontSize: 8.5, color: C.dim, flexShrink: 0 }}>
          matching {scan.done}/{scan.total}…
        </span>
      )}
      {unchangedCount > 0 && (
        <button
          onClick={onToggleHideUnchanged}
          style={{
            ...btn,
            background: hideUnchanged ? C.border : C.surface,
          }}
          title="Collapse passes whose diff is empty"
        >
          {hideUnchanged ? `${unchangedCount} same hidden` : `hide ${unchangedCount} same`}
        </button>
      )}

      {/* Track / Link / Session */}
      {linkState ? (
        <>
          <span style={{ fontSize: 9, color: C.cyan, flexShrink: 0 }}>
            Linking {linkState.count} op{linkState.count > 1 ? "s" : ""} from pass{" "}
            {linkState.fromIdx + 1} — select targets on pass {linkState.fromIdx} or{" "}
            {linkState.fromIdx + 2}
          </span>
          <button
            onClick={onLinkConfirm}
            disabled={!canConfirmLink}
            style={{
              ...btn,
              background: canConfirmLink ? C.cyan + "22" : C.surface,
              color: canConfirmLink ? C.cyan : C.dim,
              opacity: canConfirmLink ? 1 : 0.4,
            }}
          >
            Confirm link
          </button>
          <button onClick={onLinkCancel} style={btn}>
            Cancel
          </button>
        </>
      ) : (
        <>
          <button
            onClick={onTrack}
            disabled={!canTrack}
            style={{
              ...btn,
              color: canTrack ? C.green : C.dim,
              opacity: canTrack ? 1 : 0.4,
            }}
            title="Track the selected nodes across every pass"
          >
            ◉ Track
          </button>
          <button
            onClick={onLinkStart}
            disabled={!canLink}
            style={{
              ...btn,
              color: canLink ? C.cyan : C.dim,
              opacity: canLink ? 1 : 0.4,
            }}
            title="Manually link the selected nodes to nodes in an adjacent pass"
          >
            ⇄ Link
          </button>
          <button
            onClick={onSessionSave}
            style={btn}
            title="Save this debug session (snapshot refs, probes, manual links, notes) as JSON"
          >
            💾 Session
          </button>
        </>
      )}
    </div>
  );
}
