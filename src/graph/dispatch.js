import { buildGraph } from './build-graph.js';

export const isDispatch = (op) => /^flow\.dispatch\.(workgroups|region)$/.test(op.opName);

/** Build a navigable region without changing source op identities or SSA names. */
export function dispatchContents(ops, dispatch, kind = 'body') {
  const byId = new Map(ops.map((op) => [op.id, op]));
  const count = ops.find((op) => op.regionOwner === dispatch.id && op.regionKind === 'count');
  const root = kind === 'count' ? count : dispatch;
  if (!root) return { ops: [], graph: buildGraph([]) };
  const inside = (op) => {
    let parent = byId.get(op.parentId);
    while (parent) {
      if (kind === 'body' && parent.regionKind === 'count') return false;
      if (parent.id === root.id) return true;
      parent = byId.get(parent.parentId);
    }
    return false;
  };
  const body = ops.filter(inside).filter((op) => op.regionKind !== 'count').map((op) => ({
    ...op,
    parentId: op.parentId === root.id ? null : op.parentId,
    graphAlwaysShow: op.parentId === root.id,
  }));
  const defined = new Set(body.flatMap((op) => op.results));
  const inputs = [...new Set(body.flatMap((op) => op.operands))].filter((value) => !defined.has(value));
  const inputOps = inputs.map((value, i) => ({
    id: `dispatch-input-${root.id}-${i}`, opName: 'dispatch.input', dialect: 'flow',
    results: [value], rawResults: [value.replace(/@\d+$/, '')], operands: [],
    types: [], attrs: {}, children: [], parentId: null, graphAlwaysShow: true,
  }));
  const scoped = [...inputOps, ...body];
  return { ops: scoped, graph: buildGraph(scoped) };
}

/** Canonical interface shared by details and canvas. Stores bind by destination,
 * never by textual store order (one result can have several stores). */
export function dispatchInterface(ops, dispatch) {
  const { ops: body } = dispatchContents(ops, dispatch);
  const scoped = (raw) => dispatch.operands[dispatch.rawOperands.indexOf(raw)] || raw;
  const sig = dispatch.dispatchSignature;
  const captures = sig?.captures || [];
  const args = dispatch.blockArguments || [];
  const inputs = captures.map((raw, i) => ({
    outerValue: scoped(raw), rawOuter: raw, value: args[i] ? `${args[i]}@${dispatch.id}` : null,
    argument: args[i], type: sig.operandTypes[i], access: dispatch.blockArgumentTypes?.[i]?.match(/<(readonly|readwrite|writeonly):/)?.[1] || 'value',
  }));
  const workload = (sig?.workload || []).map((raw) => ({ outerValue: scoped(raw), rawOuter: raw, value: null, argument: 'workload', type: 'index', access: 'workload' }));
  const stores = body.filter((op) => op.opName.endsWith('.tensor.store'));
  const returned = body.filter((op) => op.opName === 'flow.return' && op.parentId === null).flatMap((op) => op.operands);
  let nextOutputArg = captures.length;
  const outputs = dispatch.results.map((outerValue, i) => {
    const result = sig?.results[i];
    const argIndex = result?.tiedOperand >= 0 ? result.tiedOperand : nextOutputArg++;
    const argument = args[argIndex];
    const destination = argument ? `${argument}@${dispatch.id}` : null;
    const writes = stores.filter((op) => op.operands[1] === destination);
    return { outerValue, rawOuter: dispatch.rawResults[i], argument, type: result?.type,
      tiedTo: result?.tiedOperand >= 0 ? captures[result.tiedOperand] : null,
      values: writes.length ? [...new Set(writes.map((op) => op.operands[0]))] : returned[i] ? [returned[i]] : [],
      stores: writes.map((op) => op.id),
    };
  });
  const outputArguments = new Set(outputs.map((o) => o.argument).filter(Boolean));
  const known = new Set(inputs.map((o) => o.value));
  // Implicit captures in non-isolated dispatch.region bodies are also inputs.
  for (const op of body.filter((op) => op.opName === 'dispatch.input')) {
    const value = op.results[0];
    const raw = value.replace(/@\d+$/, '');
    if (!known.has(value) && !outputArguments.has(raw)) inputs.push({ value, outerValue: value, rawOuter: raw, argument: raw, access: 'capture' });
  }
  return { inputs: [...workload, ...inputs], outputs };
}
