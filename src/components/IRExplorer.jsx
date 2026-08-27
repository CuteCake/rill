import { colors, fonts, getDialectColor } from "../utils/theme.js";
import { getActiveRegistry } from "../extensions/registry.js";

const C = colors;
const M = fonts.mono;

function truncate(s, n) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

/** Clickable SSA value tag. */
function ValTag({ name, displayName, active, onClick }) {
  return (
    <span
      onClick={(e) => { e.stopPropagation(); onClick(name); }}
      style={{
        display: "inline-block",
        padding: "0 5px",
        borderRadius: 3,
        fontSize: 10,
        fontFamily: M,
        cursor: "pointer",
        lineHeight: "18px",
        background: active ? C.accent + "25" : C.accent + "0c",
        color: active ? "#8fbfff" : C.accent,
        border: active ? `1px solid ${C.accent}44` : "1px solid transparent",
        marginRight: 3,
      }}
    >
      {displayName || name}
    </span>
  );
}

/** Type badge (tensor, memref, etc.). */
function TypeBadge({ type }) {
  const color = type.startsWith("tensor")
    ? C.green
    : type.startsWith("!hal")
      ? C.cyan
      : C.dim;

  return (
    <span
      style={{
        display: "inline-block",
        padding: "0 5px",
        borderRadius: 3,
        fontSize: 10,
        fontFamily: M,
        background: color + "14",
        color: color,
        border: `1px solid ${color}20`,
        marginRight: 3,
        whiteSpace: "nowrap",
        lineHeight: "18px",
      }}
    >
      {type}
    </span>
  );
}

/**
 * Profile-debug chips: shows which profile rule classified and (if any)
 * labeled this op, e.g. "structural · builtin-core classify[2]".
 * "default" means no rule matched and the fallback classification applied.
 */
function ProvenanceChips({ node, registry, summaryHit }) {
  const cls = registry.explainClassify(node);
  const chip = (text, color, title) => (
    <span
      title={title}
      style={{
        fontSize: 8, padding: "0 4px", borderRadius: 3, fontFamily: M,
        background: color + "10", color, border: `1px dashed ${color}44`,
        lineHeight: "15px", whiteSpace: "nowrap",
      }}
    >
      {text}
    </span>
  );
  return (
    <>
      {chip(
        cls.profile
          ? `${cls.result} · ${cls.profile} classify[${cls.ruleIndex}]`
          : `${cls.result} · default`,
        cls.profile ? C.cyan : C.dim,
        cls.rule ? `matched: ${JSON.stringify(cls.rule.match)}` : "no classify rule matched — default applied"
      )}
      {summaryHit &&
        chip(
          `label · ${summaryHit.profile} summarize[${summaryHit.ruleIndex}]`,
          C.purple,
          `matched: ${JSON.stringify({ match: summaryHit.rule.match, when: summaryHit.rule.when })}`
        )}
    </>
  );
}

/** Recursive op tree node. */
export default function OpNode({
  node,
  nodes,
  graph,
  hiVals,
  onValClick,
  selId,
  onSelect,
  collapsed,
  onToggle,
  depth = 0,
  profileDebug = false,
}) {
  const color = getDialectColor(node.dialect);
  const isSel = selId === node.id;
  const inFlow = hiVals.some((v) => graph.defs[v] === node.id);
  const isCol = collapsed.has(node.id);
  const childNodes = node.children
    .map((cid) => nodes.find((n) => n.id === cid))
    .filter(Boolean);

  const registry = getActiveRegistry();
  const isFunc = node.opName.includes("func");
  const isModule = node.opName === "module";
  const isReturn = node.opName.includes("return");
  const summaryHit = registry.explainSummarize(node);
  const summary = summaryHit ? summaryHit.result : null;

  const bg = isModule
    ? `linear-gradient(135deg,${C.surface},${C.panel})`
    : isFunc
      ? `linear-gradient(90deg,${color}08,${C.surface})`
      : isSel
        ? color + "10"
        : inFlow
          ? C.accent + "08"
          : C.surface;

  const scope = node.parentId !== null ? `@${node.parentId}` : "";
  function renderIO(label, str) {
    if (!str) return null;
    return (
      <span style={{ marginRight: 8 }}>
        <span style={{ color: C.dim, fontSize: 10 }}>{label}(</span>
        {str.split(",").map((part, i, arr) => {
          const valMatch = part.match(/%[\w#.$]+/);
          const scopedName = valMatch ? valMatch[0] + scope : null;
          return (
            <span key={i}>
              {valMatch ? (
                <ValTag name={scopedName} displayName={valMatch[0]} active={hiVals.includes(scopedName)} onClick={onValClick} />
              ) : (
                <span style={{ fontSize: 10, color: C.text }}>{part.trim()}</span>
              )}
              {i < arr.length - 1 && <span style={{ color: C.dim }}>, </span>}
            </span>
          );
        })}
        <span style={{ color: C.dim, fontSize: 10 }}>)</span>
      </span>
    );
  }

  return (
    <div style={{ marginLeft: depth > 0 ? 16 : 0 }}>
      <div
        data-in-flow={inFlow || undefined}
        onClick={() => onSelect(node.id)}
        style={{
          padding: isModule ? "8px 12px" : "5px 12px",
          marginBottom: isModule || isFunc ? 4 : 0,
          marginTop: isReturn ? 2 : 0,
          background: bg,
          borderLeft: inFlow && !isModule ? `2px solid ${C.accent}55` : "2px solid transparent",
          borderRight: `1px solid ${C.border}`,
          borderTop: `1px solid ${C.border}`,
          borderBottom: `1px solid ${C.border}`,
          borderRadius: isModule ? 8 : isFunc ? "6px 6px 0 0" : isReturn ? "0 0 6px 6px" : 0,
          cursor: "pointer",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", minHeight: 22 }}>
          {/* Collapse toggle */}
          {node.isCollapsible && (
            <span
              onClick={(e) => { e.stopPropagation(); onToggle(node.id); }}
              style={{
                width: 16, height: 16, borderRadius: 3,
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                fontSize: 10, color: C.dim, cursor: "pointer",
                background: C.bg, flexShrink: 0,
                border: `1px solid ${C.border}`,
                transform: isCol ? "rotate(-90deg)" : "rotate(0deg)",
              }}
            >
              ▼
            </span>
          )}

          {/* Results */}
          {node.results.map((r, i) => (
            <ValTag key={i} name={r} displayName={node.rawResults?.[i] || r} active={hiVals.includes(r)} onClick={onValClick} />
          ))}
          {node.results.length > 0 && <span style={{ color: C.dim, fontSize: 11 }}>=</span>}

          {/* Op name */}
          <span style={{ fontSize: 11, fontWeight: 600, fontFamily: M, color }}>{node.opName}</span>

          {/* Purpose badge (from profile summarize rules) */}
          {summary && (
            <span
              style={{
                fontSize: 9, padding: "0 6px", borderRadius: 10,
                background: summary.color + "18",
                color: summary.color,
                border: `1px solid ${summary.color}22`,
                fontWeight: 600, lineHeight: "16px",
              }}
            >
              {summary.icon} {summary.label}
            </span>
          )}

          {/* Profile debug: which rule classified/labeled this op */}
          {profileDebug && !isModule && (
            <ProvenanceChips node={node} registry={registry} summaryHit={summaryHit} />
          )}

          {/* Func/global name */}
          {node.attrs.name && (
            <span style={{ fontSize: 11, fontFamily: M, color: C.bright, fontWeight: 600 }}>
              {truncate(node.attrs.name, 40)}
            </span>
          )}

          {/* Visibility */}
          {node.attrs.vis && (
            <span style={{ fontSize: 9, padding: "0 4px", borderRadius: 3, background: color + "18", color, lineHeight: "16px" }}>
              {node.attrs.vis}
            </span>
          )}

          {/* String labels */}
          {node.attrs.labels && !summary && node.attrs.labels.map((l, i) => (
            <span key={i} style={{ fontSize: 9, padding: "0 5px", borderRadius: 3, background: C.orange + "14", color: C.orange, lineHeight: "16px" }}>
              {l}
            </span>
          ))}

          {/* Location path */}
          {node.loc && (
            <span
              style={{
                fontSize: 9, padding: "0 5px", borderRadius: 3,
                background: C.purple + "14", color: C.purple,
                lineHeight: "16px", fontFamily: M,
                fontStyle: "italic",
              }}
              title={`loc("${node.loc}")`}
            >
              loc: {node.loc}
            </span>
          )}

          {/* ins/outs */}
          {(node.attrs.ins || node.attrs.outs) && (
            <span style={{ display: "inline-flex", gap: 2, flexWrap: "wrap" }}>
              {renderIO("ins", node.attrs.ins)}
              {renderIO("outs", node.attrs.outs)}
            </span>
          )}

          {/* Operands */}
          {!node.attrs.ins && node.operands.length > 0 && node.operands.length <= 8 && !isFunc && (
            <span style={{ display: "inline-flex", gap: 2, flexWrap: "wrap" }}>
              {node.operands.map((o, i) => (
                <ValTag key={i} name={o} displayName={node.rawOperands?.[i] || o} active={hiVals.includes(o)} onClick={onValClick} />
              ))}
            </span>
          )}

          {/* Line number */}
          <span style={{ fontSize: 9, color: C.dim, marginLeft: "auto", opacity: 0.5, fontFamily: M }}>
            {node.line}
          </span>
        </div>

        {/* Types */}
        {node.types.length > 0 && node.types.length <= 6 && (
          <div style={{ marginTop: 2, marginLeft: node.isCollapsible ? 22 : 0, display: "flex", gap: 2, flexWrap: "wrap" }}>
            {node.types.map((t, i) => <TypeBadge key={i} type={t} />)}
          </div>
        )}

        {/* Captured opaque-region body (e.g. linalg.generic) */}
        {!isCol && node.genericBody && node.genericBody.length > 0 && (
          <div
            style={{
              marginTop: 6, padding: "6px 8px", borderRadius: 4,
              background: "#00000030", fontSize: 10, fontFamily: M,
              color: C.dim, lineHeight: 1.6, maxHeight: 200, overflowY: "auto",
            }}
          >
            {(node.attrs._iters || []).length > 0 && (
              <div>
                <span style={{ color: C.purple }}>iters:</span>{" "}
                {node.attrs._iters.map((it, i) => (
                  <span
                    key={i}
                    style={{
                      display: "inline-block", marginRight: 4, padding: "0 3px",
                      borderRadius: 2, fontSize: 9,
                      background: it === "reduction" ? C.red + "18" : C.green + "12",
                      color: it === "reduction" ? C.red : C.green,
                    }}
                  >
                    {it}
                  </span>
                ))}
              </div>
            )}
            <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 4, paddingTop: 4 }}>
              {node.genericBody.map((line, j) => (
                <div key={j} style={{ color: line.startsWith("^") ? C.purple : C.text }}>
                  {line}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Children */}
      {!isCol && childNodes.length > 0 && (
        <div style={{ borderLeft: `1px solid ${color}22`, marginLeft: 8 }}>
          {childNodes.map((child) => (
            <OpNode
              key={child.id}
              node={child}
              nodes={nodes}
              graph={graph}
              hiVals={hiVals}
              onValClick={onValClick}
              selId={selId}
              onSelect={onSelect}
              collapsed={collapsed}
              onToggle={onToggle}
              depth={depth + 1}
              profileDebug={profileDebug}
            />
          ))}
        </div>
      )}
    </div>
  );
}
