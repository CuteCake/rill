import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseMLIR } from '../src/parser/mlir-parser.js';
import { buildGraph } from '../src/graph/build-graph.js';
import { computeLayout } from '../src/graph/layout.js';
import { isDispatch, dispatchContents } from '../src/graph/dispatch.js';

const ops = parseMLIR(readFileSync(new URL('../yolov8n_readable/module.5.dispatch-creation.mlir', import.meta.url), 'utf8'));
const dispatches = ops.filter(isDispatch);

describe('Dispatch Creation navigation', () => {
  it('attaches multiline entry signatures and both regions to each real dispatch', () => {
    expect(dispatches.length).toBeGreaterThan(50);
    for (const d of dispatches) {
      expect(d.isRegion).toBe(true);
      expect(d.blockArguments.length).toBeGreaterThan(0);
      expect(d.loc).toBeTruthy();
      expect(ops.find((op) => op.regionOwner === d.id)?.parentId).toBe(d.id);
      expect(d.rawOperands.some((v) => d.blockArguments.includes(v))).toBe(false);
    }
  });
  it('keeps dispatch internals out of the outer graph', () => {
    const layout = computeLayout(ops, buildGraph(ops));
    expect(layout.nodes.filter((p) => isDispatch(p.node))).toHaveLength(dispatches.length);
    expect(layout.nodes.some((p) => p.node.opName.includes('workgroup_count'))).toBe(false);
    expect(layout.nodes.some((p) => p.node.opName.includes('dispatch.tensor.load'))).toBe(false);
  });
  it('shows input → load → store even for a dispatch without arithmetic', () => {
    const contents = dispatchContents(ops, dispatches[0]);
    const layout = computeLayout(contents.ops, contents.graph);
    const load = contents.ops.find((op) => op.opName.endsWith('tensor.load'));
    const store = contents.ops.find((op) => op.opName.endsWith('tensor.store'));
    expect(layout.nodes.some((p) => p.node.id === store.id)).toBe(true);
    expect(layout.edges.some((e) => e.from === load.id && e.to === store.id)).toBe(true);
    expect(layout.nodes.some((p) => p.node.opName === 'dispatch.input')).toBe(true);
    expect(contents.ops.some((op) => op.opName.includes('workgroup_count'))).toBe(false);
  });
  it('separates count regions and preserves IDs for synchronized selection', () => {
    const count = dispatchContents(ops, dispatches[0], 'count');
    expect(count.ops.some((op) => op.opName.includes('workgroup_count'))).toBe(true);
    expect(count.ops.some((op) => op.opName.includes('tensor.load'))).toBe(false);
    const body = dispatchContents(ops, dispatches[1]);
    for (const op of body.ops.filter((op) => typeof op.id === 'number')) {
      expect(ops[op.id].results).toEqual(op.results);
    }
  });
  it('retains a standalone dispatch and a single disconnected inner compute op', () => {
    const single = parseMLIR(`%0 = flow.dispatch.region -> tensor<1xf32> {
  %1 = arith.constant 1.0 : f32
  flow.return %1 : f32
}`);
    const d = single.find(isDispatch);
    expect(computeLayout(single, buildGraph(single)).nodes).toHaveLength(1);
    const body = dispatchContents(single, d);
    expect(computeLayout(body.ops, body.graph).nodes.some((p) => p.node.opName === 'arith.constant')).toBe(true);
  });
});

import { computeDispatchLayout, hitTestNodes } from '../src/graph/dispatch-layout.js';

describe('inline dispatch containers', () => {
  const graph = buildGraph(ops);
  it('reserves space for every expanded body and keeps children within its boundary', () => {
    const expanded = new Set(dispatches.map((op) => op.id));
    const layout = computeDispatchLayout(ops, graph, true, false, expanded);
    expect(layout.dispatchGroups).toHaveLength(dispatches.length);
    expect(layout.nodes.some((p) => p.node.opName === 'dispatch.input' || p.node.opName === 'flow.return')).toBe(false);
    for (const group of layout.dispatchGroups) {
      const children = layout.nodes.filter((p) => p.dispatchId === group.node.id);
      for (const p of children) {
        expect(p.x).toBeGreaterThanOrEqual(group.x);
        expect(p.y).toBeGreaterThan(group.y + 60);
        expect(p.x + p.w).toBeLessThanOrEqual(group.x + group.w);
        expect(p.y + p.h).toBeLessThan(group.y + group.h - 30);
      }
      expect(group.ports.some((p) => p.direction === 'in')).toBe(true);
      expect(group.ports.some((p) => p.direction === 'out')).toBe(true);
    }
    const outer = layout.nodes.filter((p) => p.dispatchId == null);
    for (let i = 0; i < outer.length; i++) for (let j = i + 1; j < outer.length; j++) {
      const a = outer[i], b = outer[j];
      expect(a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y).toBe(false);
    }
    expect(layout.edges.every((e) => e.points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)))).toBe(true);
  });
  it('collapses globally or expands just one without losing host dataflow', () => {
    const closed = computeDispatchLayout(ops, graph, true, false, new Set());
    const opened = computeDispatchLayout(ops, graph, true, false, new Set([dispatches[1].id]));
    expect(closed.dispatchGroups).toHaveLength(0);
    expect(opened.dispatchGroups).toHaveLength(1);
    for (const edge of closed.edges) expect(opened.edges.some((e) => e.from === edge.from && e.to === edge.to)).toBe(true);
  });
  it('hits an inner op before its dispatch shell, and clears on blank canvas', () => {
    const shell = { x: 0, y: 0, w: 500, h: 400, node: { id: 1 } };
    const inner = { x: 50, y: 80, w: 190, h: 50, node: { id: 2 } };
    expect(hitTestNodes([shell, inner], 60, 90)).toBe(inner);
    expect(hitTestNodes([shell, inner], 10, 10)).toBe(shell);
    expect(hitTestNodes([shell, inner], 600, 500)).toBeNull();
  });
});

import { dispatchInterface } from '../src/graph/dispatch.js';
import { extractTypes } from '../src/parser/dispatch-signature.js';

describe('dispatch interface accuracy', () => {
  it('does not count tied result references as input operands or truncate nested types', () => {
    const d = dispatches.find((op) => op.rawResults[0] === '%5');
    expect(d.rawOperands).toEqual(['%3', '%cst_30', '%4']);
    const io = dispatchInterface(ops, d);
    expect(io.inputs.map((p) => p.argument)).toEqual(['%arg3', '%arg4', '%arg5']);
    expect(io.outputs[0]).toMatchObject({ rawOuter: '%5', tiedTo: '%4', argument: '%arg5', type: 'tensor<16x322x322xf32>' });
    expect(io.outputs[0].values.map((v) => v.split('@')[0])).toEqual(['%264']);
    const type = '!iree_tensor_ext.dispatch.tensor<readwrite:tensor<16x322x322xf32>>';
    expect(extractTypes(`${type} -> tensor<16x322x322xf32>`)).toEqual([type, 'tensor<16x322x322xf32>']);
    expect(extractTypes('indexing_maps = [#map]')).toEqual([]);
  });
  it('maps three results by store destination rather than store order', () => {
    const d = dispatches.find((op) => op.results.length === 3);
    const stores = ops.filter((op) => op.parentId === d.id && op.opName.endsWith('.tensor.store'));
    const scrambled = ops.map((op) => stores.includes(op) ? stores[stores.length - stores.indexOf(op) - 1] : op);
    const io = dispatchInterface(scrambled, d);
    expect(io.inputs).toHaveLength(2); // writeonly result arguments are not inputs
    expect(io.outputs.map((p) => p.argument)).toEqual(['%arg5', '%arg6', '%arg7']);
    expect(io.outputs.map((p) => p.values[0].split('@')[0])).toEqual(['%263#0', '%263#1', '%263#2']);
    expect(io.outputs.map((p) => p.rawOuter)).toEqual(['%242#0', '%242#1', '%242#2']);
  });
  for (const showAux of [true, false]) it(`connects every real host edge to its exact SSA port (aux=${showAux})`, () => {
    const layout = computeDispatchLayout(ops, buildGraph(ops), showAux, false, new Set(dispatches.map((d) => d.id)));
    const groups = new Map(layout.dispatchGroups.map((g) => [g.node.id, g]));
    for (const edge of layout.edges.filter((e) => e.boundaryEdge)) {
      const from = groups.get(edge.from);
      const to = groups.get(edge.to);
      if (from) {
        const port = from.ports.find((p) => p.direction === 'out' && p.outerValue === edge.value);
        expect(port, `missing output ${edge.value}`).toBeDefined();
        expect(edge.points[0]).toEqual({ x: port.x, y: port.y });
      }
      if (to) {
        const ports = to.ports.filter((p) => p.direction === 'in' && p.outerValue === edge.targetValue);
        expect(ports.length, `missing input ${edge.targetValue}`).toBeGreaterThan(0);
        expect(ports.some((p) => p.x === edge.points.at(-1).x && p.y === edge.points.at(-1).y)).toBe(true);
      }
    }
    for (const g of groups.values()) {
      expect(g.ports.filter((p) => p.direction === 'out')).toHaveLength(g.node.results.length);
      expect(g.ports.filter((p) => p.direction === 'out').every((p) => p.values.length > 0)).toBe(true);
    }
  });
});

import { getActiveRegistry } from '../src/extensions/registry.js';
it('does not describe the real three-result add/sub kernel as bias addition', () => {
  const d = dispatches.find((op) => op.results.length === 3);
  const kernel = ops.find((op) => op.parentId === d.id && op.opName === 'linalg.generic');
  expect(getActiveRegistry().summarize(kernel).label).toBe('add / subtract');
});
