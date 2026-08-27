import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { colors, fonts } from "./utils/theme.js";
import { SAMPLE_MLIR } from "./utils/sample-mlir.js";
import { parseSource } from "./parser/index.js";
import { buildGraph, getHighlightedNodeSets } from "./graph/build-graph.js";
import { getActiveRegistry, setUserProfiles } from "./extensions/registry.js";
import { validateProfile } from "./extensions/validate.js";
import { createSnapshotStore } from "./pipeline/snapshot-store.js";
import { naturalCompare } from "./pipeline/natural-sort.js";
import { contentHash } from "./pipeline/hash.js";
import { matchSnapshots } from "./pipeline/match.js";
import { keysForOps } from "./pipeline/node-key.js";
import { probeLineage, lineageTrail } from "./pipeline/lineage.js";
import { diffSets, translatePositions, pairDiffStats } from "./pipeline/step-context.js";
import { classifyRemovedOps, removalNote, buildGhostSeeds } from "./pipeline/ghosts.js";
import { LAYOUT, isAuxiliaryOp } from "./graph/layout.js";
import { matchDiff } from "./pipeline/text-diff.js";
import { buildSession, loadSession, attachFiles } from "./pipeline/session.js";
import { downloadJSON } from "./utils/download.js";
import NodeDiff from "./components/NodeDiff.jsx";
import GraphView from "./components/GraphView.jsx";
import ProfileGuide from "./components/ProfileGuide.jsx";
import Sidebar from "./components/Sidebar.jsx";
import SourceView from "./components/SourceView.jsx";
import OpNode from "./components/IRExplorer.jsx";
import Timeline, { TIMELINE_HEIGHT, chipLabel } from "./components/Timeline.jsx";

const C = colors;
const M = fonts.mono;

const PROBE_PALETTE = [C.yellow, C.cyan, C.pink, C.lime, C.orange, C.purple];

/** Hover hints for the cross-pass match provenance labels. */
const KIND_HINT = {
  same: "Survived this pass unchanged (modulo value renumbering)",
  changed: "Survived this pass but its text/attributes changed — see the diff below",
  split: "One op became several in this pass (lowering / decomposition)",
  merged: "Several ops became one in this pass (fusion / folding)",
};
const VIA_HINT = {
  symbol: "Matching method: unique symbol name (func/global/layer name) — certain",
  loc: "Matching method: unique source-location provenance on both sides",
  "loc+fp":
    "Matching method: several ops share this source location; paired by best structural score (op name, types, body fingerprint, neighbors)",
  "fused-loc":
    "Matching method: shared/fused source-location provenance — a split/merge family, not an exact 1:1 pairing",
  structure:
    "Matching method: no location info; aligned by op name and position within the enclosing scope",
  manual: "Matching method: manually linked by you (saved in the session)",
};

export default function App() {
  const [view, setView] = useState("graph");
  const [selId, setSelId] = useState(null);
  const [hiVals, setHiVals] = useState([]);
  const [collapsed, setCollapsed] = useState(new Set());
  const [search, setSearch] = useState("");
  const fileRef = useRef(null);
  const profileRef = useRef(null);
  const attachRef = useRef(null);
  const scrollRef = useRef(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailWidth, setDetailWidth] = useState(340);

  // Dialect profile registry (user profile stacks on built-ins)
  const [registry, setRegistry] = useState(getActiveRegistry());
  const [profileErrors, setProfileErrors] = useState([]);
  const [userProfileName, setUserProfileName] = useState(null);
  const [profileDebug, setProfileDebug] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);

  // ── Snapshot series (pass pipeline) ──
  // The store is a mutable cache container, so it lives in a ref (like the
  // GraphView camera); seriesRev bumps whenever its contents change.
  const storeRef = useRef(null);
  if (!storeRef.current) {
    storeRef.current = createSnapshotStore({
      parse: (text, name) => {
        const p = parseSource(text, name, getActiveRegistry());
        return { ...p, graph: buildGraph(p.ops) };
      },
      match: (a, b, overrides) =>
        matchSnapshots(a.ops, a.graph, b.ops, b.graph, overrides),
      hash: contentHash,
    });
    storeRef.current.load([{ name: "demo.mlir", text: SAMPLE_MLIR }]);
  }
  const store = storeRef.current;
  const [seriesRev, setSeriesRev] = useState(0);
  const [activeIdx, setActiveIdx] = useState(0);
  const [probes, setProbes] = useState([]);
  const probeSeq = useRef(0);
  const [sessionMeta, setSessionMeta] = useState(null); // {name, notes, views}
  const [pendingSession, setPendingSession] = useState(null);
  const [sessionErrors, setSessionErrors] = useState([]);
  const [sessionWarnings, setSessionWarnings] = useState([]);
  const [linkFrom, setLinkFrom] = useState(null); // {idx, keys, count}
  const [missingSet, setMissingSet] = useState(new Set());
  const [hideUnchanged, setHideUnchanged] = useState(true);
  const lastRenderedRef = useRef(null); // {idx, posById, layout} from GraphView
  const isSeries = store.length > 1;

  const snapMeta = store.snapshots[activeIdx];
  const src = snapMeta?.text ?? "";
  const fileName = snapMeta?.name ?? "demo.mlir";

  // Parse + graph via the store (lazy, cached per snapshot). A registry
  // change alters parsing, so it drops the caches synchronously here.
  const lastRegistryRef = useRef(registry);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const parsed = useMemo(() => {
    if (lastRegistryRef.current !== registry) {
      store.invalidateParses();
      lastRegistryRef.current = registry;
    }
    return (
      store.getParsed(activeIdx) || {
        ops: [],
        graph: { defs: {}, uses: {}, edges: [] },
        warnings: [],
      }
    );
  }, [store, activeIdx, seriesRev, registry]);
  const nodes = parsed.ops;
  const graph = parsed.graph;

  // Import warnings (non-fatal), dismissable until the next file load
  const [warningsHidden, setWarningsHidden] = useState(false);
  useEffect(() => setWarningsHidden(false), [src]);
  const importWarnings = warningsHidden ? [] : parsed.warnings;

  // Callbacks
  const onValClick = useCallback(
    (v) => setHiVals((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v])),
    []
  );
  const onToggle = useCallback(
    (id) => setCollapsed((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; }),
    []
  );
  const onSelectToggle = useCallback(
    (id) => setSelId((prev) => (prev === id ? null : id)),
    []
  );
  const onLocClick = useCallback(
    (loc) => {
      // Gather all SSA results from nodes with this loc
      const locVals = nodes
        .filter((n) => n.loc === loc && n.results.length > 0)
        .map((n) => n.results[0]);
      if (!locVals.length) return;
      setHiVals((prev) => {
        const allSelected = locVals.every((v) => prev.includes(v));
        if (allSelected) {
          // Deselect: remove all vals for this loc
          const removeSet = new Set(locVals);
          return prev.filter((v) => !removeSet.has(v));
        }
        // Select: add any missing vals for this loc
        const existing = new Set(prev);
        return [...prev, ...locVals.filter((v) => !existing.has(v))];
      });
    },
    [nodes]
  );

  // ── Series loading / session routing ──

  function readFileAsText(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (ev) =>
        resolve({
          name: file.name,
          text: typeof ev.target?.result === "string" ? ev.target.result : "",
        });
      reader.onerror = () => resolve({ name: file.name, text: "" });
      reader.readAsText(file);
    });
  }

  function resetDocState() {
    setSelId(null);
    setHiVals([]);
    setCollapsed(new Set());
    setSearch("");
    setView("graph");
    setLinkFrom(null);
    lastRenderedRef.current = null;
  }

  function loadSeries(files, opts = {}) {
    const { sort = true, probes: newProbes = [], overrides = [], meta = null, missing = [] } = opts;
    const ordered = sort ? [...files].sort((a, b) => naturalCompare(a.name, b.name)) : files;
    store.load(ordered);
    if (overrides.length) store.setOverrides(overrides);
    setProbes(newProbes);
    setSessionMeta(meta);
    setMissingSet(new Set(missing));
    setActiveIdx(0);
    resetDocState();
    setSeriesRev((r) => r + 1);
  }

  function routeLoadedFiles(loaded) {
    if (loaded.length === 1 && loaded[0].name.endsWith(".json")) {
      handleSessionFile(loaded[0]);
      return;
    }
    setSessionErrors([]);
    setSessionWarnings([]);
    loadSeries(loaded.filter((f) => !f.name.endsWith(".json")));
  }

  function handleFile(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;
    Promise.all(files.map(readFileAsText)).then(routeLoadedFiles);
  }

  function handleDrop(e) {
    e.preventDefault();
    const files = Array.from(e.dataTransfer?.files || []);
    if (!files.length) return;
    Promise.all(files.map(readFileAsText)).then(routeLoadedFiles);
  }

  function handleSessionFile({ name, text }) {
    const { ok, errors, session } = loadSession(text);
    if (!ok) {
      setSessionErrors(errors.map((m) => `${name}: ${m}`));
      return;
    }
    setSessionErrors([]);
    setPendingSession(session);
  }

  function handleAttachFiles(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length || !pendingSession) return;
    const session = pendingSession;
    Promise.all(files.map(readFileAsText)).then((loaded) => {
      const { ordered, warnings, missing } = attachFiles(session.snapshots, loaded);
      loadSeries(
        ordered.map((o) => ({ name: o.ref.file, text: o.file?.text ?? "" })),
        {
          sort: false, // the session's snapshot order is authoritative
          probes: session.probes || [],
          overrides: session.overrides || [],
          meta: { name: session.name, notes: session.notes, views: session.views || [] },
          missing,
        }
      );
      setSessionWarnings(warnings);
      setPendingSession(null);
    });
  }

  function saveSession() {
    const session = buildSession({
      name: sessionMeta?.name || fileName.replace(/\.[^.]+$/, ""),
      notes: sessionMeta?.notes,
      created: new Date().toISOString(),
      snapshots: store.snapshots,
      probes,
      overrides: store.overrides,
      views: sessionMeta?.views || [],
    });
    const base = (session.name || "rill-session").replace(/[^\w.-]+/g, "-");
    downloadJSON(session, `${base}.rill-session.json`);
  }

  // ── Probes (track) and manual link overrides ──

  function addProbe() {
    const { primary } = getHighlightedNodeSets(hiVals, graph);
    if (!primary.size) return;
    const keys = keysForOps(nodes);
    const first = nodes[[...primary][0]];
    const name = first?.loc?.split("/").pop() || first?.opName || "probe";
    probeSeq.current += 1;
    setProbes((prev) => [
      ...prev,
      {
        id: `p${probeSeq.current}`,
        name: primary.size > 1 ? `${name} +${primary.size - 1}` : name,
        color: PROBE_PALETTE[prev.length % PROBE_PALETTE.length],
        originIndex: activeIdx,
        keys: [...primary].map((id) => keys.get(id)),
      },
    ]);
    setHiVals([]);
  }

  function startLink() {
    const { primary } = getHighlightedNodeSets(hiVals, graph);
    if (!primary.size) return;
    const keys = keysForOps(nodes);
    setLinkFrom({
      idx: activeIdx,
      keys: [...primary].map((id) => keys.get(id)),
      count: primary.size,
    });
    setHiVals([]);
  }

  const canConfirmLink =
    !!linkFrom && Math.abs(activeIdx - linkFrom.idx) === 1 && hiVals.length > 0;

  function confirmLink() {
    if (!canConfirmLink) return;
    const { primary } = getHighlightedNodeSets(hiVals, graph);
    if (!primary.size) return;
    const keys = keysForOps(nodes);
    const targetKeys = [...primary].map((id) => keys.get(id));
    const forward = activeIdx > linkFrom.idx;
    store.addOverride({
      pair: forward ? [linkFrom.idx, activeIdx] : [activeIdx, linkFrom.idx],
      action: "link",
      from: forward ? linkFrom.keys : targetKeys,
      to: forward ? targetKeys : linkFrom.keys,
    });
    setLinkFrom(null);
    setHiVals([]);
    setSeriesRev((r) => r + 1);
  }

  function unlinkOp(op) {
    const ms = activeIdx > 0 ? store.getMatches(activeIdx - 1) : null;
    const m = ms?.toIndex.get(op.id);
    if (!m) return;
    const prev = store.getParsed(activeIdx - 1);
    const prevKeys = keysForOps(prev.ops);
    const curKeys = keysForOps(nodes);
    store.addOverride({
      pair: [activeIdx - 1, activeIdx],
      action: "unlink",
      from: m.from.map((id) => prevKeys.get(id)),
      to: m.to.map((id) => curKeys.get(id)),
    });
    setSeriesRev((r) => r + 1);
  }

  // ── Derived pipeline context ──

  const selectSnapshot = useCallback((i) => {
    setActiveIdx(i);
    setHiVals([]); // SSA value strings are not portable across snapshots
    setSelId(null);
  }, []);

  // Idle-warm neighbor snapshots and their pair matches
  useEffect(() => {
    if (!isSeries) return;
    const idle = window.requestIdleCallback || ((f) => setTimeout(f, 300));
    const cancel = window.cancelIdleCallback || clearTimeout;
    const h = idle(() => {
      if (store.warm(activeIdx)) setSeriesRev((r) => r + 1);
    });
    return () => cancel(h);
  }, [isSeries, activeIdx, seriesRev, store]);

  const onLayoutRendered = useCallback((info) => {
    lastRenderedRef.current = info;
  }, []);

  // Step context: diff overlay for "what did this pass do", camera-anchor
  // positions when arriving from an adjacent snapshot, and ghost seeds for
  // this pass's removals. Ghosts derive from the pair match itself, so
  // they render however the user arrived (chip jump, backward step, or a
  // background rev bump re-rendering the same snapshot); the previous
  // rendered layout — captured at a forward arrival — only adds fallback
  // positions for isolated removals.
  const arrivalRef = useRef(null); // {toIdx, prevLayout}
  const ghostDims = useCallback(
    (op) =>
      isAuxiliaryOp(op)
        ? { w: LAYOUT.AUX_W, h: LAYOUT.AUX_H, isAux: true }
        : { w: LAYOUT.NODE_W, h: LAYOUT.NODE_H, isAux: false },
    []
  );
  const stepContext = useMemo(() => {
    if (!isSeries) return null;
    const ms = activeIdx > 0 ? store.getMatches(activeIdx - 1) : null;
    const diff = ms ? diffSets(ms) : null;
    let prevPos = null;
    const last = lastRenderedRef.current;
    if (last) {
      if (last.idx === activeIdx) {
        prevPos = last.posById; // same snapshot re-render: hold camera
      } else if (Math.abs(last.idx - activeIdx) === 1) {
        const forward = activeIdx === last.idx + 1;
        const pairMs = store.getMatches(Math.min(last.idx, activeIdx));
        if (pairMs) {
          prevPos = translatePositions(last.posById, pairMs, forward);
        }
        arrivalRef.current = forward
          ? { toIdx: activeIdx, prevLayout: last.layout }
          : null;
      } else {
        arrivalRef.current = null;
      }
    }
    let ghosts = [];
    if (ms) {
      const prevParsed = store.getParsed(activeIdx - 1);
      const cls = classifyRemovedOps(ms, prevParsed.graph, parsed.graph);
      const prevLayout =
        arrivalRef.current?.toIdx === activeIdx ? arrivalRef.current.prevLayout : null;
      ghosts = buildGhostSeeds(ms, prevParsed.ops, cls, ghostDims, prevLayout);
    }
    return { prevPos, diff, ghosts };
  }, [isSeries, activeIdx, seriesRev, store, parsed, ghostDims]);

  // Probe lineages → halos on the current snapshot + sidebar trails
  const lineages = useMemo(
    () => (isSeries ? probes.map((p) => probeLineage(p, store)) : []),
    [isSeries, probes, seriesRev, store]
  );
  const probeHalos = useMemo(() => {
    if (!isSeries || !probes.length) return null;
    const m = new Map();
    lineages.forEach((per, i) => {
      for (const id of per[activeIdx]?.ids || []) m.set(id, probes[i].color);
    });
    return m;
  }, [isSeries, lineages, probes, activeIdx]);
  const probesForSidebar = useMemo(() => {
    const names = store.snapshots.map((s) => chipLabel(s.name));
    return probes.map((p, i) => ({
      ...p,
      trail: lineages[i] ? lineageTrail(lineages[i], names).map((t) => t.label) : [],
    }));
  }, [probes, lineages, store, seriesRev]);

  // Sidebar pass-diff lists (ops with results only — structural noise out)
  const passDiff = useMemo(() => {
    if (!isSeries || activeIdx === 0) return null;
    const ms = store.getMatches(activeIdx - 1);
    if (!ms) return null;
    const prev = store.getParsed(activeIdx - 1);
    const changedIds = [];
    for (const m of ms.matches) if (m.kind === "changed") changedIds.push(...m.to);
    // Annotate removals with their structural fate (replaced by X / folded)
    // and remember which current ops each removal relates to, so clicking
    // a removed row can select "where it went".
    const cls = classifyRemovedOps(ms, prev.graph, parsed.graph);
    const removedNotes = new Map();
    const removedTargets = new Map();
    for (const [id, c] of cls) {
      const note = removalNote(c, nodes);
      if (note) removedNotes.set(id, note);
      const targets =
        c.kind === "replaced"
          ? [c.replacedBy]
          : c.kind === "bypassed"
            ? [c.producer, c.consumer]
            : c.kind === "neighbor"
              ? [c.anchorId]
              : [];
      if (targets.length) removedTargets.set(id, targets);
    }
    return {
      passName: chipLabel(store.snapshots[activeIdx].name),
      added: ms.added.filter((id) => nodes[id]?.results.length > 0).map((id) => nodes[id]),
      removed: ms.removed.filter((id) => prev.ops[id]?.results.length > 0).map((id) => prev.ops[id]),
      changed: changedIds.filter((id) => nodes[id]?.results.length > 0).map((id) => nodes[id]),
      removedNotes,
      removedTargets,
    };
  }, [isSeries, activeIdx, seriesRev, nodes, parsed, store]);

  // Clicking a removed row selects the current ops the removal relates to
  // (replacement / corridor endpoints / surviving neighbor) and highlights
  // the ghost itself on canvas.
  const [hiGhostId, setHiGhostId] = useState(null);
  const onRemovedClick = useCallback(
    (op) => {
      setHiGhostId(op.id);
      const targets = passDiff?.removedTargets?.get(op.id) || [];
      const vals = [...new Set(targets)]
        .map((id) => nodes[id]?.results[0])
        .filter(Boolean);
      setHiVals(vals);
    },
    [passDiff, nodes]
  );
  useEffect(() => {
    if (hiVals.length === 0) setHiGhostId(null);
  }, [hiVals]);

  // Per-pair classification: identical text (free), or — once the pair's
  // match is computed — changed vs unchanged. Drives badges, collapsed
  // chips, and skip-stepping.
  const pairStatus = useMemo(() => {
    if (!isSeries) return [];
    const out = [];
    for (let i = 0; i < store.length - 1; i++) {
      const a = store.snapshots[i];
      const b = store.snapshots[i + 1];
      if (a.text && a.hash === b.hash) {
        out.push({ status: "identical", stats: null });
        continue;
      }
      const ms = store.peekMatches(i);
      if (!ms) {
        out.push({ status: "unknown", stats: null });
        continue;
      }
      const stats = pairDiffStats(ms, store.getParsed(i).ops, store.getParsed(i + 1).ops);
      out.push({ status: stats.hasDiff ? "changed" : "unchanged", stats });
    }
    return out;
  }, [isSeries, seriesRev, store]);

  const pairBadges = useMemo(
    () =>
      pairStatus.map((p) =>
        p.stats
          ? { added: p.stats.added, removed: p.stats.removed, changed: p.stats.changed }
          : null
      ),
    [pairStatus]
  );

  const unchangedCount = useMemo(
    () => pairStatus.filter((p) => p.status === "identical" || p.status === "unchanged").length,
    [pairStatus]
  );

  // A chip collapses when its incoming pass produced no visible diff.
  // Chip 0 and the active chip always stay visible.
  const chipVisible = useMemo(() => {
    return store.snapshots.map((_, i) => {
      if (!hideUnchanged || i === 0 || i === activeIdx) return true;
      const p = pairStatus[i - 1];
      return !p || p.status === "changed" || p.status === "unknown";
    });
  }, [pairStatus, hideUnchanged, activeIdx, store, seriesRev]);

  // Background sweep: classify every pair one idle tick at a time (skips
  // hash-identical pairs, which need no parse). With a 100-pass dump this
  // is what collapses the ~90 no-op passes without blocking the UI.
  useEffect(() => {
    if (!isSeries) return;
    const next = pairStatus.findIndex((p) => p.status === "unknown");
    if (next < 0) return;
    const idle = window.requestIdleCallback || ((f) => setTimeout(f, 300));
    const cancel = window.cancelIdleCallback || clearTimeout;
    const h = idle(() => {
      store.getMatches(next);
      setSeriesRev((r) => r + 1);
    });
    return () => cancel(h);
  }, [isSeries, pairStatus, store]);

  const scan = useMemo(() => {
    if (!isSeries) return null;
    const unknown = pairStatus.filter((p) => p.status === "unknown").length;
    return { done: pairStatus.length - unknown, total: pairStatus.length };
  }, [isSeries, pairStatus]);

  // Step to the adjacent visible chip, skipping collapsed unchanged runs
  // (endpoints always reachable)
  const stepBy = useCallback(
    (dir) => {
      let j = activeIdx + dir;
      while (j > 0 && j < store.length - 1 && !chipVisible[j]) j += dir;
      if (j >= 0 && j < store.length) selectSnapshot(j);
    },
    [activeIdx, chipVisible, store, selectSnapshot]
  );

  // Timeline keyboard stepping
  useEffect(() => {
    if (!isSeries) return;
    const onKey = (e) => {
      const tag = e.target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "[" && activeIdx > 0) stepBy(-1);
      if (e.key === "]" && activeIdx < store.length - 1) stepBy(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isSeries, activeIdx, store, stepBy]);

  function handleProfileFile(e) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file after edits
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      if (typeof ev.target?.result !== "string") return;
      let profile;
      try {
        profile = JSON.parse(ev.target.result);
      } catch (err) {
        setProfileErrors([`${file.name}: not valid JSON — ${err.message}`]);
        return;
      }
      const { ok, errors } = validateProfile(profile);
      if (!ok) {
        setProfileErrors(errors.map((msg) => `${file.name}: ${msg}`));
        return;
      }
      setProfileErrors([]);
      setUserProfileName(profile.name);
      setRegistry(setUserProfiles([profile]));
    };
    reader.readAsText(file);
  }

  const clearProfile = useCallback(() => {
    setUserProfileName(null);
    setProfileErrors([]);
    setRegistry(setUserProfiles([]));
  }, []);

  // Auto-scroll to first highlighted element when switching to IR Explorer or Source
  useEffect(() => {
    if ((view === "ir" || view === "source") && hiVals.length > 0) {
      requestAnimationFrame(() => {
        const sel = view === "ir" ? "[data-in-flow]" : "[data-hi-line]";
        const el = scrollRef.current?.querySelector(sel);
        if (el) el.scrollIntoView({ behavior: "instant", block: "center" });
      });
    }
  }, [view]); // only on tab switch

  // Resize handle for detail panel
  const onResizeStart = useCallback((e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = detailWidth;
    const onMove = (ev) => {
      const delta = startX - ev.clientX;
      setDetailWidth(Math.max(200, Math.min(600, startW + delta)));
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [detailWidth]);

  // Auto-open detail panel when values are highlighted on graph view
  useEffect(() => {
    if (hiVals.length > 0) setDetailOpen(true);
    else setDetailOpen(false);
  }, [hiVals]);

  // Nodes in the highlighted flow (for side panel) — only primary (clicked) nodes
  const flowNodes = useMemo(() => {
    if (hiVals.length === 0) return [];
    return nodes.filter((n) =>
      hiVals.some((v) => graph.defs[v] === n.id)
    );
  }, [nodes, graph, hiVals]);

  // Git-style diffs for the selected ops against their previous-pass
  // counterparts (one entry per match group; unmatched ops listed as new)
  const selectionDiffs = useMemo(() => {
    if (!isSeries || activeIdx === 0 || flowNodes.length === 0) return null;
    const ms = store.peekMatches(activeIdx - 1);
    if (!ms) return null;
    const prev = store.getParsed(activeIdx - 1);
    const seen = new Set();
    const out = [];
    for (const n of flowNodes) {
      const m = ms.toIndex.get(n.id);
      if (!m) {
        out.push({ op: n, match: null, rows: null });
        continue;
      }
      if (seen.has(m)) continue;
      seen.add(m);
      out.push({
        op: n,
        match: m,
        rows: matchDiff(
          m.from.map((id) => prev.ops[id]),
          m.to.map((id) => nodes[id])
        ),
      });
    }
    return out;
  }, [isSeries, activeIdx, flowNodes, nodes, store, seriesRev]);

  // Filtering
  const topNodes = nodes.filter((n) => n.parentId === null);
  const matchesSearch = (n) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      n.opName.toLowerCase().includes(s) ||
      n.results.some((r) => r.toLowerCase().includes(s)) ||
      (n.attrs.name || "").toLowerCase().includes(s)
    );
  };

  const tabs = [
    { key: "graph", label: "⬡ Graph" },
    { key: "ir", label: "IR Explorer" },
    { key: "source", label: "Source" },
  ];

  const smallBtn = {
    padding: "3px 8px",
    borderRadius: 3,
    border: `1px solid ${C.border}`,
    background: C.surface,
    color: C.dim,
    fontSize: 10,
    cursor: "pointer",
  };

  return (
    <div
      style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: fonts.ui }}
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
    >
      {/* Hidden file inputs */}
      <input
        ref={fileRef}
        type="file"
        multiple
        accept=".mlir,.txt,.ir,.ll,.prototxt,.pbtxt,.json"
        onChange={handleFile}
        style={{ display: "none" }}
      />
      <input
        ref={profileRef}
        type="file"
        accept=".json"
        onChange={handleProfileFile}
        style={{ display: "none" }}
      />
      <input
        ref={attachRef}
        type="file"
        multiple
        accept=".mlir,.txt,.ir,.ll,.prototxt,.pbtxt"
        onChange={handleAttachFiles}
        style={{ display: "none" }}
      />

      {/* ── Header ── */}
      <div
        style={{
          padding: "7px 14px",
          borderBottom: `1px solid ${C.border}`,
          background: C.panel,
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        {/* Logo — a traced value, the same gesture the graph draws */}
        <div
          style={{
            width: 24, height: 24, borderRadius: 6,
            background: "linear-gradient(160deg, #121826, #0c0f17)",
            border: `1px solid ${C.border}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <svg width="17" height="17" viewBox="0 0 48 48" fill="none" aria-label="Rill">
            <defs>
              <linearGradient id="rillLogo" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#8fb4ff" />
                <stop offset="0.55" stopColor={C.accent} />
                <stop offset="1" stopColor="#22d3ee" />
              </linearGradient>
            </defs>
            <path
              d="M24 9 L24 18 C24 21 16 21 16 24 L16 31 C16 34 32 34 32 37 L32 40"
              stroke="url(#rillLogo)" strokeWidth="3.4"
              strokeLinecap="round" strokeLinejoin="round"
            />
            <circle cx="24" cy="8" r="3" fill="#dfe9ff" />
            <circle cx="32" cy="40" r="2.7" fill="#22d3ee" />
          </svg>
        </div>

        {/* Title */}
        <div style={{ marginRight: 4 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.bright }}>Rill</div>
          <div style={{ fontSize: 9, color: C.dim }}>
            {fileName} · {nodes.length} ops
            {isSeries ? ` · pass ${activeIdx + 1}/${store.length}` : ""}
          </div>
        </div>

        {/* Open file */}
        <button
          onClick={() => fileRef.current?.click()}
          style={{
            padding: "4px 10px", borderRadius: 4,
            border: `1px solid ${C.accent}33`,
            background: C.accent + "12",
            color: C.accent, fontSize: 10, cursor: "pointer", fontWeight: 600,
            display: "flex", alignItems: "center", gap: 4,
          }}
        >
          📂 Open
        </button>

        {/* Load dialect profile (see docs/PROFILE_SPEC.md) */}
        <button
          onClick={() => profileRef.current?.click()}
          title="Load a dialect profile (.json) — see docs/PROFILE_SPEC.md"
          style={{
            padding: "4px 10px", borderRadius: 4,
            border: `1px solid ${userProfileName ? C.cyan + "55" : C.border}`,
            background: userProfileName ? C.cyan + "12" : C.surface,
            color: userProfileName ? C.cyan : C.dim,
            fontSize: 10, cursor: "pointer", fontWeight: 600,
            display: "flex", alignItems: "center", gap: 4,
          }}
        >
          ⚙ {userProfileName || "Profile"}
        </button>

        {/* Profile authoring guide + AI kit copier */}
        <button
          onClick={() => setGuideOpen(true)}
          title="How to create your own profile (with a copy-paste AI kit)"
          style={{
            padding: "4px 10px", borderRadius: 4,
            border: `1px solid ${C.border}`,
            background: C.surface, color: C.dim,
            fontSize: 10, cursor: "pointer", fontWeight: 600,
            display: "flex", alignItems: "center", gap: 4,
          }}
        >
          ✨ Guide
        </button>

        {/* Search (IR Explorer only) */}
        {view === "ir" && (
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            style={{
              padding: "3px 8px", borderRadius: 4,
              border: `1px solid ${C.border}`,
              background: C.surface, color: C.text,
              fontSize: 10, width: 140, outline: "none", fontFamily: M,
            }}
          />
        )}

        {/* View tabs */}
        <div
          style={{
            display: "flex", gap: 1, background: C.bg, borderRadius: 5, padding: 2, marginLeft: "auto",
          }}
        >
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setView(t.key)}
              style={{
                padding: "4px 10px", borderRadius: 4, border: "none", cursor: "pointer",
                fontSize: 10, fontWeight: view === t.key ? 600 : 400,
                background: view === t.key ? C.surface : "transparent",
                color: view === t.key ? C.bright : C.dim,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* IR Explorer controls */}
        {view === "ir" && (
          <>
            <button
              onClick={() => setCollapsed(new Set(nodes.filter((n) => n.isCollapsible).map((n) => n.id)))}
              style={smallBtn}
            >
              Fold
            </button>
            <button onClick={() => setCollapsed(new Set())} style={smallBtn}>
              Unfold
            </button>
          </>
        )}

        {/* Clear highlights */}
        {hiVals.length > 0 && (
          <button
            onClick={() => setHiVals([])}
            style={{ ...smallBtn, background: C.accent + "14", color: C.accent }}
          >
            Clear ({hiVals.length})
          </button>
        )}
      </div>

      {/* Profile validation errors — written to be pasted back to an AI */}
      {profileErrors.length > 0 && (
        <div
          style={{
            padding: "8px 14px", background: C.red + "10",
            borderBottom: `1px solid ${C.red}33`, fontSize: 10, fontFamily: M,
            color: C.red, maxHeight: 140, overflowY: "auto",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontWeight: 700 }}>
              Profile rejected — fix these and reload (paste them to your AI assistant):
            </span>
            <span onClick={() => setProfileErrors([])} style={{ cursor: "pointer", padding: "0 4px" }}>✕</span>
          </div>
          {profileErrors.map((err, i) => (
            <div key={i} style={{ lineHeight: 1.6 }}>• {err}</div>
          ))}
        </div>
      )}

      {/* Import warnings — non-fatal issues from a prototxt import mapping */}
      {importWarnings.length > 0 && (
        <div
          style={{
            padding: "8px 14px", background: C.yellow + "10",
            borderBottom: `1px solid ${C.yellow}33`, fontSize: 10, fontFamily: M,
            color: C.yellow, maxHeight: 140, overflowY: "auto",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontWeight: 700 }}>
              Imported with {importWarnings.length} warning{importWarnings.length > 1 ? "s" : ""}:
            </span>
            <span onClick={() => setWarningsHidden(true)} style={{ cursor: "pointer", padding: "0 4px" }}>✕</span>
          </div>
          {importWarnings.map((w, i) => (
            <div key={i} style={{ lineHeight: 1.6 }}>• {w}</div>
          ))}
        </div>
      )}

      {/* Session errors — a rejected session file */}
      {sessionErrors.length > 0 && (
        <div
          style={{
            padding: "8px 14px", background: C.red + "10",
            borderBottom: `1px solid ${C.red}33`, fontSize: 10, fontFamily: M,
            color: C.red, maxHeight: 140, overflowY: "auto",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontWeight: 700 }}>Session rejected — fix these and reload:</span>
            <span onClick={() => setSessionErrors([])} style={{ cursor: "pointer", padding: "0 4px" }}>✕</span>
          </div>
          {sessionErrors.map((err, i) => (
            <div key={i} style={{ lineHeight: 1.6 }}>• {err}</div>
          ))}
        </div>
      )}

      {/* Session warnings — stale hashes, renamed or missing files */}
      {sessionWarnings.length > 0 && (
        <div
          style={{
            padding: "8px 14px", background: C.yellow + "10",
            borderBottom: `1px solid ${C.yellow}33`, fontSize: 10, fontFamily: M,
            color: C.yellow, maxHeight: 140, overflowY: "auto",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontWeight: 700 }}>
              Session opened with {sessionWarnings.length} warning{sessionWarnings.length > 1 ? "s" : ""}:
            </span>
            <span onClick={() => setSessionWarnings([])} style={{ cursor: "pointer", padding: "0 4px" }}>✕</span>
          </div>
          {sessionWarnings.map((w, i) => (
            <div key={i} style={{ lineHeight: 1.6 }}>• {w}</div>
          ))}
        </div>
      )}

      {/* Pass timeline */}
      {isSeries && (
        <Timeline
          snapshots={store.snapshots.map((s) => ({
            name: s.name,
            missing: missingSet.has(s.name) || !s.text,
          }))}
          activeIdx={activeIdx}
          onSelect={selectSnapshot}
          onStep={stepBy}
          badges={pairBadges}
          chipVisible={chipVisible}
          hideUnchanged={hideUnchanged}
          onToggleHideUnchanged={() => setHideUnchanged((v) => !v)}
          unchangedCount={unchangedCount}
          scan={scan}
          canTrack={hiVals.length > 0}
          onTrack={addProbe}
          linkState={linkFrom ? { fromIdx: linkFrom.idx, count: linkFrom.count } : null}
          canLink={hiVals.length > 0}
          canConfirmLink={canConfirmLink}
          onLinkStart={startLink}
          onLinkConfirm={confirmLink}
          onLinkCancel={() => setLinkFrom(null)}
          onSessionSave={saveSession}
        />
      )}

      {/* ── Body ── */}
      <div style={{ display: "flex", height: `calc(100vh - ${43 + (isSeries ? TIMELINE_HEIGHT : 0) + (profileErrors.length > 0 ? 140 : 0) + (importWarnings.length > 0 ? 140 : 0) + (sessionErrors.length > 0 ? 140 : 0) + (sessionWarnings.length > 0 ? 140 : 0)}px)` }}>
        <Sidebar
          nodes={nodes}
          graph={graph}
          hiVals={hiVals}
          onValClick={onValClick}
          onLocClick={onLocClick}
          profileDebug={profileDebug}
          onToggleProfileDebug={() => setProfileDebug((v) => !v)}
          userProfileName={userProfileName}
          onClearProfile={clearProfile}
          passDiff={passDiff}
          onRemovedClick={onRemovedClick}
          probes={isSeries ? probesForSidebar : undefined}
          onProbeRemove={(id) => setProbes((prev) => prev.filter((p) => p.id !== id))}
        />

        {view === "graph" ? (
          <>
            <GraphView
              ops={nodes}
              graph={graph}
              hiVals={hiVals}
              onValClick={onValClick}
              registry={registry}
              stepContext={stepContext}
              probeHalos={probeHalos}
              hiGhostId={hiGhostId}
              snapshotIdx={activeIdx}
              onLayoutRendered={isSeries ? onLayoutRendered : undefined}
            />
            {/* Selection detail side panel */}
            {detailOpen && flowNodes.length > 0 && (
              <div
                style={{
                  width: detailWidth, flexShrink: 0, position: "relative",
                  background: C.panel, display: "flex", flexDirection: "column",
                }}
              >
                {/* Resize handle */}
                <div
                  onMouseDown={onResizeStart}
                  style={{
                    position: "absolute", left: 0, top: 0, bottom: 0, width: 4,
                    cursor: "col-resize", borderLeft: `1px solid ${C.border}`, zIndex: 1,
                  }}
                />
                <div
                  style={{
                    padding: "8px 12px", borderBottom: `1px solid ${C.border}`,
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                  }}
                >
                  <span style={{ fontSize: 11, fontWeight: 600, color: C.bright }}>
                    Selection ({flowNodes.length} ops)
                  </span>
                  <button
                    onClick={() => setDetailOpen(false)}
                    style={{
                      background: "none", border: "none", color: C.dim,
                      cursor: "pointer", fontSize: 14, padding: "0 4px", lineHeight: 1,
                    }}
                  >
                    ✕
                  </button>
                </div>
                {/* Cross-pass match provenance + git-style diff per selected op */}
                {selectionDiffs && (
                  <div
                    style={{
                      padding: "6px 12px",
                      borderBottom: `1px solid ${C.border}`,
                      fontSize: 9,
                      fontFamily: M,
                      maxHeight: "45%",
                      overflowY: "auto",
                      flexShrink: 0,
                    }}
                  >
                    {selectionDiffs.map(({ op, match: m, rows }) => (
                      <div key={op.id}>
                        <div style={{ display: "flex", gap: 6, alignItems: "center", lineHeight: 1.9 }}>
                          <span style={{ color: C.text, flexShrink: 0 }}>{op.opName}</span>
                          {m ? (
                            <span style={{ color: C.dim, flex: 1, display: "flex", gap: 0, flexWrap: "wrap" }}>
                              <span title={KIND_HINT[m.kind] || m.kind} style={{ cursor: "help" }}>
                                {m.kind}
                              </span>
                              <span>&nbsp;·&nbsp;</span>
                              <span title={VIA_HINT[m.via] || m.via} style={{ cursor: "help" }}>
                                via {m.via}
                              </span>
                              <span>&nbsp;·&nbsp;</span>
                              <span
                                title={
                                  `Match confidence: how sure the matcher is that this link is correct (100% = certain, e.g. a unique symbol or your own manual link)` +
                                  (m.confidence < 0.7
                                    ? " — LOW: verify with the diff below and Unlink if wrong"
                                    : "")
                                }
                                style={{
                                  cursor: "help",
                                  ...(m.confidence < 0.7
                                    ? { color: C.red, fontWeight: 700 }
                                    : {}),
                                }}
                              >
                                {Math.round(m.confidence * 100)}%
                                {m.confidence < 0.7 ? " !" : ""}
                              </span>
                              {(m.from.length > 1 || m.to.length > 1) && (
                                <>
                                  <span>&nbsp;·&nbsp;</span>
                                  <span
                                    title={`Group match: ${m.from.length} op${m.from.length > 1 ? "s" : ""} in the previous pass → ${m.to.length} op${m.to.length > 1 ? "s" : ""} in this pass`}
                                    style={{ cursor: "help" }}
                                  >
                                    {m.from.length}→{m.to.length}
                                  </span>
                                </>
                              )}
                            </span>
                          ) : (
                            <span
                              title="No counterpart found in the previous pass — this op was materialized by this pass"
                              style={{ color: C.dim, flex: 1, cursor: "help" }}
                            >
                              new in this pass
                            </span>
                          )}
                          {m && (
                            <button
                              onClick={() => unlinkOp(op)}
                              title="Reject this cross-pass match (saved to the session)"
                              style={{
                                padding: "0 6px", borderRadius: 3, fontSize: 9,
                                border: `1px solid ${C.border}`, background: C.surface,
                                color: C.dim, cursor: "pointer",
                              }}
                            >
                              Unlink
                            </button>
                          )}
                        </div>
                        {rows && (
                          <NodeDiff rows={rows} defaultOpen={m ? m.kind !== "same" : false} />
                        )}
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ flex: 1, overflowY: "auto", padding: "8px 10px" }}>
                  {flowNodes.map((n) => (
                    <OpNode
                      key={n.id}
                      node={n}
                      nodes={nodes}
                      graph={graph}
                      hiVals={hiVals}
                      onValClick={onValClick}
                      selId={selId}
                      onSelect={onSelectToggle}
                      collapsed={collapsed}
                      onToggle={onToggle}
                      profileDebug={profileDebug}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "12px 16px" }}>
            {view === "ir" ? (
              <div style={{ maxWidth: 860 }}>
                {(search ? nodes.filter(matchesSearch) : topNodes).map((n) => (
                  <OpNode
                    key={n.id}
                    node={n}
                    nodes={nodes}
                    graph={graph}
                    hiVals={hiVals}
                    onValClick={onValClick}
                    selId={selId}
                    onSelect={onSelectToggle}
                    collapsed={collapsed}
                    onToggle={onToggle}
                    profileDebug={profileDebug}
                  />
                ))}
              </div>
            ) : (
              <SourceView src={src} hiVals={hiVals} nodes={nodes} graph={graph} />
            )}
          </div>
        )}
      </div>

      <ProfileGuide
        open={guideOpen}
        onClose={() => setGuideOpen(false)}
        src={src}
        fileName={fileName}
        nodes={nodes}
      />

      {/* Session attach dialog — sessions store references, not IR */}
      {pendingSession && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 100,
            background: "rgba(4,6,10,0.72)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
          onClick={() => setPendingSession(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 460, maxHeight: "70vh", overflowY: "auto",
              background: C.panel, border: `1px solid ${C.border}`,
              borderRadius: 8, padding: "16px 18px",
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 700, color: C.bright, marginBottom: 6 }}>
              Open session{pendingSession.name ? ` “${pendingSession.name}”` : ""}
            </div>
            <div style={{ fontSize: 10, color: C.dim, lineHeight: 1.6, marginBottom: 10 }}>
              Sessions reference snapshot files by name and content hash — the IR itself is
              not embedded. Re-select the {pendingSession.snapshots.length} dump file
              {pendingSession.snapshots.length > 1 ? "s" : ""} below to restore probes and
              manual links.
            </div>
            <div style={{ fontSize: 10, fontFamily: M, color: C.text, lineHeight: 1.8, marginBottom: 12 }}>
              {pendingSession.snapshots.map((s) => (
                <div key={s.file}>• {s.file}</div>
              ))}
            </div>
            {pendingSession.notes && (
              <div style={{ fontSize: 10, color: C.dim, marginBottom: 12, whiteSpace: "pre-wrap" }}>
                {pendingSession.notes}
              </div>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => attachRef.current?.click()}
                style={{
                  padding: "5px 12px", borderRadius: 4,
                  border: `1px solid ${C.accent}33`, background: C.accent + "12",
                  color: C.accent, fontSize: 11, cursor: "pointer", fontWeight: 600,
                }}
              >
                📂 Attach files…
              </button>
              <button
                onClick={() => setPendingSession(null)}
                style={{
                  padding: "5px 12px", borderRadius: 4,
                  border: `1px solid ${C.border}`, background: C.surface,
                  color: C.dim, fontSize: 11, cursor: "pointer",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
