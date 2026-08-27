/**
 * NodeDiff — git-style rendering of a cross-pass op diff in the selection
 * panel. Rows come from src/pipeline/text-diff.js matchDiff(); changed
 * tokens are highlighted strongly, pure SSA/#alias renames only dotted so
 * renumbering noise doesn't hide the attribute that actually changed.
 */

import { useState } from "react";
import { colors, fonts } from "../utils/theme.js";

const C = colors;
const M = fonts.mono;
const MAX_ROWS = 160;

const ROW_STYLE = {
  del: { background: C.red + "14", color: "#e0a0a0", prefix: "−" },
  add: { background: C.green + "12", color: "#a9d8c0", prefix: "+" },
  context: { background: "transparent", color: C.dim, prefix: " " },
};

function Span({ span, rowType }) {
  if (span.hl === "chg") {
    const bg = rowType === "del" ? C.red + "55" : C.green + "45";
    return (
      <span style={{ background: bg, color: C.bright, borderRadius: 2 }}>
        {span.text}
      </span>
    );
  }
  if (span.hl === "ren") {
    return (
      <span style={{ borderBottom: `1px dotted ${C.dim}`, opacity: 0.85 }}>
        {span.text}
      </span>
    );
  }
  return <span>{span.text}</span>;
}

export default function NodeDiff({ rows, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  const [showAll, setShowAll] = useState(false);
  const changes = rows.filter((r) => r.type === "del" || r.type === "add").length;

  if (!open) {
    return (
      <div
        onClick={() => setOpen(true)}
        style={{ fontSize: 9, color: C.dim, cursor: "pointer", padding: "1px 0 4px 14px" }}
      >
        ▸ diff ({changes ? `${changes} lines` : "renames only"})
      </div>
    );
  }
  const shown = showAll ? rows : rows.slice(0, MAX_ROWS);
  return (
    <div style={{ margin: "2px 0 6px 0" }}>
      <div
        onClick={() => setOpen(false)}
        style={{ fontSize: 9, color: C.dim, cursor: "pointer", padding: "1px 0 2px 14px" }}
      >
        ▾ diff
      </div>
      <div
        style={{
          border: `1px solid ${C.border}`,
          borderRadius: 4,
          overflowX: "auto",
          fontFamily: M,
          fontSize: 9,
          lineHeight: 1.65,
          background: C.bg,
        }}
      >
        {shown.map((row, i) => {
          if (row.type === "skip") {
            return (
              <div key={i} style={{ padding: "0 8px", color: C.dim, background: C.surface, fontStyle: "italic" }}>
                ⋯ {row.count} unchanged line{row.count > 1 ? "s" : ""}
              </div>
            );
          }
          const s = ROW_STYLE[row.type];
          return (
            <div
              key={i}
              style={{
                padding: "0 8px",
                whiteSpace: "pre",
                background: s.background,
                color: s.color,
              }}
            >
              <span style={{ userSelect: "none", opacity: 0.7 }}>{s.prefix} </span>
              {row.spans.map((sp, k) => (
                <Span key={k} span={sp} rowType={row.type} />
              ))}
            </div>
          );
        })}
        {!showAll && rows.length > MAX_ROWS && (
          <div
            onClick={() => setShowAll(true)}
            style={{ padding: "0 8px", color: C.accent, cursor: "pointer" }}
          >
            … show {rows.length - MAX_ROWS} more rows
          </div>
        )}
      </div>
    </div>
  );
}
