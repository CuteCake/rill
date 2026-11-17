import { computeLayout } from './layout.js';
import { dispatchContents, dispatchInterface, isDispatch } from './dispatch.js';

const clean = (v) => v.replace(/@\d+$/, '');
const isExit = (op) => /(?:\.return|\.tensor\.store)$/.test(op.opName);

/** Compound graph: lay out bodies first, then reserve their actual size in the host DAG. */
export function computeDispatchLayout(ops, graph, showAux, locGrouping, expanded) {
  const bodies = new Map();
  for (const dispatch of ops.filter((op) => isDispatch(op) && expanded.has(op.id))) {
    const contents = dispatchContents(ops, dispatch);
    const { inputs, outputs } = dispatchInterface(ops, dispatch);
    const bodyOps = contents.ops.filter((op) => op.opName !== 'dispatch.input' && !isExit(op));
    const inner = computeLayout(bodyOps, contents.graph, showAux, false, { preserveValues: true });
    const width = Math.max(320, inner.w + 40, inputs.length * 170 + 40, outputs.length * 190 + 40);
    const height = Math.max(200, inner.h + 150);
    const ports = [
      ...inputs.map((input, i) => ({ ...input, label: input.argument && input.argument !== input.rawOuter ? `${input.rawOuter} → ${input.argument}` : input.rawOuter, direction: 'in', x: (i + 1) * width / (inputs.length + 1), y: 0 })),
      ...outputs.map((output, i) => ({ ...output, value: output.values[0], label: `${output.argument || output.values.map(clean).join(', ') || '?'} → ${output.rawOuter}`, direction: 'out', x: (i + 1) * width / (outputs.length + 1), y: height })),
    ];
    const offsetX = (width - inner.w) / 2;
    const offsetY = 100;
    const nodes = inner.nodes.map((p) => ({ ...p, x: p.x + offsetX, y: p.y + offsetY, dispatchId: dispatch.id }));
    const edges = inner.edges.map((e) => ({ ...e, points: e.points.map((p) => ({ x: p.x + offsetX, y: p.y + offsetY })) }));
    const visible = new Map(nodes.map((p) => [p.node.id, p]));
    const byId = new Map(contents.ops.map((op) => [op.id, op]));
    // Resolve through collapsed auxiliary ops to a visible producer or an input port.
    const sources = (value, seen = new Set()) => {
      if (seen.has(value)) return [];
      seen.add(value);
      const producer = contents.graph.defs[value];
      if (visible.has(producer)) {
        const p = visible.get(producer);
        return [{ id: producer, x: p.x + p.w / 2, y: p.y + p.h }];
      }
      const port = ports.find((p) => p.direction === 'in' && p.value === value);
      if (port) return [{ id: `port:${dispatch.id}:${value}`, x: port.x, y: port.y + 10 }];
      return (byId.get(producer)?.operands || []).flatMap((v) => sources(v, seen));
    };
    for (const p of nodes) {
      for (const value of new Set(p.node.operands)) {
        for (const from of sources(value)) {
          if (!String(from.id).startsWith('port:')) continue;
          edges.push({ from: from.id, to: p.node.id, value, points: [from, { x: p.x + p.w / 2, y: p.y }] });
        }
      }
    }
    for (const port of ports.filter((p) => p.direction === 'out')) {
      for (const value of port.values) for (const from of sources(value)) edges.push({ from: from.id, to: `output:${dispatch.id}:${port.value}`, value, points: [from, { x: port.x, y: port.y - 10 }] });
    }
    // A tied result also preserves the incoming destination tensor (e.g. a
    // partial store updates a padded tensor). Make that alias explicit.
    for (const output of ports.filter((p) => p.direction === 'out' && p.tiedTo)) {
      const input = ports.find((p) => p.direction === 'in' && p.rawOuter === output.tiedTo);
      if (input) edges.push({ from: `port:${dispatch.id}:${input.value}`, to: `output:${dispatch.id}:${output.outerValue}`,
        value: input.outerValue, label: `tied ${input.rawOuter} → ${output.rawOuter}`, tiedEdge: true,
        points: [{ x: input.x, y: input.y + 10 }, { x: input.x, y: 72 }, { x: width - 16, y: 72 },
          { x: width - 16, y: height - 28 }, { x: output.x, y: height - 28 }, { x: output.x, y: output.y - 10 }] });
    }
    bodies.set(dispatch.id, { nodes, edges, ports, width, height });
  }
  const sized = ops.map((op) => bodies.has(op.id) ? { ...op, layoutWidth: bodies.get(op.id).width, layoutHeight: bodies.get(op.id).height } : op);
  const outer = computeLayout(sized, graph, showAux, locGrouping, { preserveValues: true });
  const nodes = [...outer.nodes];
  const edges = [];
  const dispatchGroups = [];
  for (const p of outer.nodes) {
    const body = bodies.get(p.node.id);
    if (!body) continue;
    p.expandedDispatch = true;
    dispatchGroups.push({ ...p, ports: body.ports.map((port) => ({ ...port, x: port.x + p.x, y: port.y + p.y })) });
    nodes.push(...body.nodes.map((n) => ({ ...n, x: n.x + p.x, y: n.y + p.y })));
    edges.push(...body.edges.map((e) => ({ ...e, points: e.points.map((point) => ({ ...point, x: point.x + p.x, y: point.y + p.y })) })));
  }
  const groupsById = new Map(dispatchGroups.map((g) => [g.node.id, g]));
  for (const edge of outer.edges) {
    const output = groupsById.get(edge.from)?.ports.find((p) => p.direction === 'out' && p.outerValue === edge.value);
    const targets = groupsById.get(edge.to)?.ports.filter((p) => p.direction === 'in' && p.outerValue === (edge.targetValue || edge.value)) || [];
    for (const input of targets.length ? targets : [null]) {
      const start = output ? { x: output.x, y: output.y } : edge.points[0];
      const end = input ? { x: input.x, y: input.y } : edge.points.at(-1);
      const points = [start];
      if (output) points.push({ x: start.x, y: start.y + 18 });
      points.push(...edge.points.slice(1, -1));
      if (input) points.push({ x: end.x, y: end.y - 18 });
      points.push(end);
      edges.push({ ...edge, points, boundaryEdge: true });
    }
  }
  return { ...outer, nodes, edges, dispatchGroups };
}

/** Smallest hit wins so children take precedence over their container. */
export function hitTestNodes(candidates, x, y) {
  return candidates.filter((p) => x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h)
    .sort((a, b) => a.w * a.h - b.w * b.h)[0] || null;
}
