import { useMemo } from "react";
import { colors, fonts } from "../utils/theme.js";

const C = colors;
const M = fonts.mono;

export default function SourceView({ src, hiVals, nodes, graph }) {
  const lines = src.split("\n");

  // Build set of highlighted line numbers from hiVals → op ids → op line numbers
  const hiLines = useMemo(() => {
    const lineSet = new Set();
    if (!graph || !nodes || !hiVals.length) return lineSet;
    const opsById = new Map(nodes.map((n) => [n.id, n]));
    for (const v of hiVals) {
      const opId = graph.defs[v];
      if (opId !== undefined) {
        const op = opsById.get(opId);
        if (op) lineSet.add(op.line);
      }
    }
    return lineSet;
  }, [hiVals, nodes, graph]);

  return (
    <div
      style={{
        background: C.surface,
        borderRadius: 8,
        border: `1px solid ${C.border}`,
        padding: 10,
        overflowX: "auto",
      }}
    >
      <div style={{ fontFamily: M, fontSize: 10.5, lineHeight: 1.7 }}>
        {lines.map((line, i) => {
          const lineNum = i + 1;
          const isHighlighted = hiLines.has(lineNum);
          return (
            <div
              key={i}
              data-hi-line={isHighlighted || undefined}
              style={{
                display: "flex",
                gap: 6,
                padding: "0 8px",
                background: isHighlighted ? C.accent + "0a" : "transparent",
                borderLeft: isHighlighted
                  ? `2px solid ${C.accent}`
                  : "2px solid transparent",
              }}
            >
              <span
                style={{
                  color: C.dim,
                  opacity: 0.3,
                  minWidth: 28,
                  textAlign: "right",
                  userSelect: "none",
                }}
              >
                {lineNum}
              </span>
              <span style={{ color: C.text, whiteSpace: "pre" }}>{line}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
