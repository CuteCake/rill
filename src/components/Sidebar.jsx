import { useState } from "react";
import { colors, getDialectColor, fonts, getLocColor } from "../utils/theme.js";
import { getActiveRegistry } from "../extensions/registry.js";
import { isStructuralOp } from "../graph/layout.js";

const C = colors;
const M = fonts.mono;

export default function Sidebar({
  nodes, graph, hiVals, onValClick, onLocClick,
  profileDebug, onToggleProfileDebug, userProfileName, onClearProfile,
  passDiff,       // {passName, added, removed, changed, removedNotes, removedTargets} | null
  onRemovedClick, // (op) → select where a removed op went + highlight its ghost
  probes,         // [{id, name, color, trail: [string]}] | undefined
  onProbeRemove,
}) {
  const [locFilter, setLocFilter] = useState("");
  const [valFilter, setValFilter] = useState("");
  const [width, setWidth] = useState(176);
  const onResizeStart = (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = width;
    const onMove = (ev) =>
      setWidth(Math.max(150, Math.min(480, startW + ev.clientX - startX)));
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };
  const registry = getActiveRegistry();
  // Dialect counts
  const dialects = {};
  nodes.forEach((n) => {
    if (n.dialect && n.dialect !== "block") {
      dialects[n.dialect] = (dialects[n.dialect] || 0) + 1;
    }
  });

  // Purpose breakdown from profile summarize rules (e.g. linalg.generic kinds)
  const purposeCounts = {};
  let labeledCount = 0;
  let defaultClassified = 0;
  nodes.forEach((n) => {
    const p = registry.summarize(n);
    if (p) {
      labeledCount++;
      purposeCounts[p.label] = purposeCounts[p.label] || { ...p, count: 0 };
      purposeCounts[p.label].count++;
    }
    if (registry.explainClassify(n).profile === null) defaultClassified++;
  });

  // Location groups (full loc path) — also track which vals belong to each loc
  const locGroups = {};
  const locVals = {}; // loc → array of SSA result values
  nodes.forEach((n) => {
    if (n.loc) {
      locGroups[n.loc] = (locGroups[n.loc] || 0) + 1;
      if (n.results.length > 0) {
        if (!locVals[n.loc]) locVals[n.loc] = [];
        locVals[n.loc].push(n.results[0]);
      }
    }
  });
  // Check which locs have any selected node
  const hiSet = new Set(hiVals);
  const locHasSelection = (loc) => (locVals[loc] || []).some((v) => hiSet.has(v));

  // Disconnected ops — visible ops with no dataflow edges
  const connectedIds = new Set();
  for (const e of graph.edges) {
    connectedIds.add(e.from);
    connectedIds.add(e.to);
  }
  const disconnected = nodes.filter(
    (n) => n.results.length > 0 && !isStructuralOp(n) && !connectedIds.has(n.id)
  );

  return (
    <div
      style={{
        width,
        minWidth: width,
        borderRight: `1px solid ${C.border}`,
        background: C.panel,
        flexShrink: 0,
        position: "relative",
      }}
    >
      {/* Drag handle — widen to read long diff annotations */}
      <div
        onMouseDown={onResizeStart}
        title="Drag to resize"
        style={{
          position: "absolute", right: 0, top: 0, bottom: 0, width: 5,
          cursor: "col-resize", zIndex: 2,
        }}
      />
      <div
        style={{
          height: "100%",
          overflowY: "auto",
          padding: "10px 8px",
          fontSize: 11,
          boxSizing: "border-box",
        }}
      >
      {/* Quick stats */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 3, marginBottom: 10 }}>
        {[
          ["Ops", nodes.length, C.accent],
          ["Values", Object.keys(graph.defs).length, C.green],
          ["Edges", graph.edges.length, C.yellow],
          ["Labeled", labeledCount, C.pink],
        ].map(([label, value, color]) => (
          <div
            key={label}
            style={{
              padding: "4px 6px",
              borderRadius: 4,
              background: color + "0a",
              border: `1px solid ${color}12`,
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 700, color }}>{value}</div>
            <div style={{ fontSize: 8, color: C.dim, textTransform: "uppercase", letterSpacing: 0.5 }}>
              {label}
            </div>
          </div>
        ))}
      </div>

      {/* Tracked probes (pass-pipeline mode) */}
      {probes && probes.length > 0 && (
        <>
          <SectionHeader>Probes</SectionHeader>
          {probes.map((p) => (
            <div key={p.id} style={{ marginBottom: 6, padding: "3px 4px", borderLeft: `2px solid ${p.color}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ flex: 1, color: p.color, fontSize: 10, fontWeight: 600 }}>
                  ◉ {p.name}
                </span>
                <span
                  onClick={() => onProbeRemove?.(p.id)}
                  title="Remove probe"
                  style={{ cursor: "pointer", color: C.dim, fontSize: 10, padding: "0 3px" }}
                >
                  ✕
                </span>
              </div>
              {p.trail?.length > 0 && (
                <div style={{ fontSize: 8.5, color: C.dim, lineHeight: 1.5, fontFamily: M }}>
                  {p.trail.map((t, i) => (
                    <div key={i}>{t}</div>
                  ))}
                </div>
              )}
            </div>
          ))}
          <Divider />
        </>
      )}

      {/* Pass diff (pass-pipeline mode) */}
      {passDiff && (
        <>
          <SectionHeader>Pass diff · {passDiff.passName}</SectionHeader>
          {[
            ["added", passDiff.added, C.green, "+"],
            ["changed", passDiff.changed, C.yellow, "~"],
            ["removed", passDiff.removed, C.red, "−"],
          ].map(([kind, ops, color, glyph]) =>
            ops.length > 0 ? (
              <DiffList
                key={kind}
                kind={kind}
                ops={ops}
                color={color}
                glyph={glyph}
                onItemClick={
                  kind === "removed"
                    ? onRemovedClick
                    : (op) => op.results.length && onValClick(op.results[0])
                }
                noteOf={
                  kind === "removed"
                    ? (op) => passDiff.removedNotes?.get(op.id)
                    : undefined
                }
              />
            ) : null
          )}
          {passDiff.added.length + passDiff.changed.length + passDiff.removed.length === 0 && (
            <div style={{ fontSize: 9, color: C.dim, padding: "0 4px" }}>
              no visible changes in this pass
            </div>
          )}
          <Divider />
        </>
      )}

      {/* Dialect breakdown */}
      <SectionHeader>Dialects</SectionHeader>
      {Object.entries(dialects)
        .sort((a, b) => b[1] - a[1])
        .map(([dialect, count]) => (
          <div
            key={dialect}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              marginBottom: 2,
              padding: "2px 4px",
            }}
          >
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: 2,
                background: getDialectColor(dialect),
                flexShrink: 0,
              }}
            />
            <span style={{ flex: 1, color: C.text }}>{dialect}</span>
            <span style={{ fontSize: 9, color: C.dim }}>{count}</span>
          </div>
        ))}

      {/* Location groups */}
      {Object.keys(locGroups).length > 0 && (
        <>
          <Divider />
          <SectionHeader>Locations</SectionHeader>
          <input
            type="text"
            value={locFilter}
            onChange={(e) => setLocFilter(e.target.value)}
            placeholder="Filter locations..."
            style={{
              width: "100%",
              padding: "3px 6px",
              marginBottom: 4,
              fontSize: 10,
              fontFamily: M,
              background: C.surface,
              color: C.text,
              border: `1px solid ${C.border}`,
              borderRadius: 3,
              outline: "none",
              boxSizing: "border-box",
            }}
          />
          <div style={{ maxHeight: 240, overflowY: "auto" }}>
            {Object.entries(locGroups)
              .sort((a, b) => b[1] - a[1])
              .filter(([loc]) => !locFilter || loc.toLowerCase().includes(locFilter.toLowerCase()))
              .map(([loc, count]) => {
                const isActive = locHasSelection(loc);
                return (
                  <div
                    key={loc}
                    onClick={() => onLocClick(loc)}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 5,
                      marginBottom: 2,
                      padding: "2px 4px",
                      borderRadius: 3,
                      cursor: "pointer",
                      background: isActive ? getLocColor(loc) + "20" : "transparent",
                      border: isActive ? `1px solid ${getLocColor(loc)}40` : "1px solid transparent",
                    }}
                  >
                    <div
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: 2,
                        background: getLocColor(loc),
                        flexShrink: 0,
                        marginTop: 3,
                      }}
                    />
                    <span style={{ flex: 1, color: isActive ? C.text : C.text, fontSize: 9, wordBreak: "break-all", lineHeight: 1.3 }}>{loc}</span>
                    <span style={{ fontSize: 9, color: C.dim }}>{count}</span>
                  </div>
                );
              })}
          </div>
        </>
      )}

      {/* Purpose breakdown (profile summarize rules) */}
      {Object.keys(purposeCounts).length > 0 && (
        <>
          <Divider />
          <SectionHeader>Op Purposes</SectionHeader>
          {Object.values(purposeCounts)
            .sort((a, b) => b.count - a.count)
            .map((p) => (
              <div key={p.label} style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 2 }}>
                <span style={{ fontSize: 11, width: 14, textAlign: "center", color: p.color }}>{p.icon}</span>
                <span style={{ flex: 1, fontSize: 10, color: C.text }}>{p.label}</span>
                <span style={{ fontSize: 9, color: C.dim }}>{p.count}</span>
              </div>
            ))}
        </>
      )}

      {/* SSA values */}
      <Divider />
      <SectionHeader>SSA Values</SectionHeader>
      <input
        type="text"
        value={valFilter}
        onChange={(e) => setValFilter(e.target.value)}
        placeholder="Filter values..."
        style={{
          width: "100%",
          padding: "3px 6px",
          marginBottom: 4,
          fontSize: 10,
          fontFamily: M,
          background: C.surface,
          color: C.text,
          border: `1px solid ${C.border}`,
          borderRadius: 3,
          outline: "none",
          boxSizing: "border-box",
        }}
      />
      <div style={{ maxHeight: 180, overflowY: "auto" }}>
        {Object.entries(graph.defs)
          .filter(
            ([val]) =>
              !valFilter ||
              val.replace(/@\d+$/, "").toLowerCase().includes(valFilter.toLowerCase())
          )
          .map(([val]) => (
          <div
            key={val}
            onClick={() => onValClick(val)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              marginBottom: 1,
              padding: "1px 4px",
              borderRadius: 3,
              cursor: "pointer",
              background: hiVals.includes(val) ? C.accent + "14" : "transparent",
            }}
          >
            <span style={{ fontSize: 10, fontFamily: M, color: C.accent }}>{val.replace(/@\d+$/, "")}</span>
            <span style={{ fontSize: 8, color: C.dim, marginLeft: "auto" }}>
              →{(graph.uses[val] || []).length}
            </span>
          </div>
        ))}
      </div>

      {/* Disconnected ops — not shown in graph */}
      {disconnected.length > 0 && (
        <>
          <Divider />
          <SectionHeader>Disconnected Ops ({disconnected.length})</SectionHeader>
          <div style={{ maxHeight: 140, overflowY: "auto" }}>
            {disconnected.map((op) => (
              <div
                key={op.id}
                onClick={() => op.results.length > 0 && onValClick(op.results[0])}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  marginBottom: 1,
                  padding: "1px 4px",
                  borderRadius: 3,
                  cursor: "pointer",
                }}
              >
                <div
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: 2,
                    background: getDialectColor(op.dialect),
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontSize: 10, fontFamily: M, color: C.text, flex: 1 }}>
                  {op.opName.includes(".") ? op.opName.split(".").pop() : op.opName}
                </span>
                <span style={{ fontSize: 9, fontFamily: M, color: C.dim }}>
                  {(op.rawResults || op.results)[0]}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Active profiles + debug toggle */}
      <Divider />
      <SectionHeader>Profiles</SectionHeader>
      {registry.profiles.map((p) => {
        const isUser = p.name === userProfileName;
        return (
          <div key={p.name} style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 2, padding: "2px 4px" }}>
            <div style={{ width: 6, height: 6, borderRadius: 2, background: isUser ? C.cyan : C.dim, flexShrink: 0 }} />
            <span style={{ flex: 1, color: C.text, fontFamily: M, fontSize: 10 }}>{p.name}</span>
            <span style={{ fontSize: 9, color: C.dim }}>
              {(p.classify || []).length + (p.regions || []).length + (p.summarize || []).length} rules
            </span>
            {isUser && (
              <span
                onClick={onClearProfile}
                title="Remove loaded profile"
                style={{ fontSize: 10, color: C.dim, cursor: "pointer", padding: "0 2px" }}
              >
                ✕
              </span>
            )}
          </div>
        );
      })}
      {defaultClassified > 0 && (
        <div style={{ fontSize: 9, color: C.dim, padding: "2px 4px" }}>
          {defaultClassified} ops classified by default (no rule matched)
        </div>
      )}
      <label
        style={{
          display: "flex", alignItems: "center", gap: 5, padding: "3px 4px",
          fontSize: 10, color: profileDebug ? C.cyan : C.dim, cursor: "pointer",
        }}
      >
        <input
          type="checkbox"
          checked={profileDebug}
          onChange={onToggleProfileDebug}
          style={{ margin: 0, accentColor: C.cyan }}
        />
        Profile debug
      </label>
      {profileDebug && (
        <div style={{ fontSize: 9, color: C.dim, padding: "0 4px", lineHeight: 1.4 }}>
          IR Explorer now shows which profile rule matched each op.
        </div>
      )}

      <Divider />
      <div style={{ fontSize: 10, color: C.dim, lineHeight: 1.5 }}>
        Click <span style={{ color: C.accent }}>%values</span> or graph nodes to trace dataflow.
      </div>
      </div>
    </div>
  );
}

/** Collapsible list of ops for one pass-diff kind (added/changed/removed). */
function DiffList({ kind, ops, color, glyph, onItemClick, noteOf }) {
  const [open, setOpen] = useState(false);
  const shown = open ? ops : ops.slice(0, 5);
  return (
    <div style={{ marginBottom: 4 }}>
      <div
        onClick={() => setOpen((v) => !v)}
        style={{ fontSize: 9, color, cursor: "pointer", padding: "1px 4px", fontWeight: 700 }}
      >
        {glyph} {ops.length} {kind} {ops.length > 5 ? (open ? "▾" : "▸") : ""}
      </div>
      {shown.map((op) => {
        const note = noteOf?.(op);
        return (
          <div
            key={op.id}
            onClick={onItemClick ? () => onItemClick(op) : undefined}
            title={
              kind === "removed"
                ? `${op.opName} — existed in the previous pass${op.loc ? ` · ${op.loc}` : ""}${note ? ` · ${note}` : ""} — click to select the related nodes`
                : op.loc || op.opName
            }
            style={{
              fontSize: 9,
              fontFamily: M,
              color: kind === "removed" ? C.dim : C.text,
              padding: "1px 4px 1px 12px",
              cursor: onItemClick ? "pointer" : "default",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {op.opName}
            {op.loc ? ` · ${op.loc.split("/").pop()}` : ""}
            {note && <span style={{ color: C.orange, opacity: 0.85 }}> · {note}</span>}
          </div>
        );
      })}
      {!open && ops.length > 5 && (
        <div
          onClick={() => setOpen(true)}
          style={{ fontSize: 8.5, color: C.dim, cursor: "pointer", padding: "0 4px 0 12px" }}
        >
          … {ops.length - 5} more
        </div>
      )}
    </div>
  );
}

function SectionHeader({ children }) {
  return (
    <div
      style={{
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: 1.2,
        textTransform: "uppercase",
        color: C.dim,
        marginBottom: 4,
      }}
    >
      {children}
    </div>
  );
}

function Divider() {
  return <div style={{ height: 1, background: C.border, margin: "8px 0" }} />;
}
