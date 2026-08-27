/**
 * SSA Def-Use Graph Builder
 *
 * Builds a graph of SSA value definitions and uses from a flat array of
 * parsed ops. This is the core data structure for dataflow visualization.
 *
 * Returns:
 *   defs  - Map from SSA value name → defining op id
 *   uses  - Map from SSA value name → array of consumer op ids
 *   edges - Array of { from, to, value } edges
 */

/**
 * Build the def-use graph from parsed ops.
 * @param {Array<Object>} ops - array from parseMLIR()
 * @returns {{ defs: Object, uses: Object, edges: Array }}
 */
export function buildGraph(ops) {
  const defs = {};
  const uses = {};
  const edges = [];

  // Phase 1: register all definitions
  for (const op of ops) {
    for (const result of op.results) {
      defs[result] = op.id;
    }
  }

  // Phase 2: build use edges
  for (const op of ops) {
    for (const operand of op.operands) {
      const defId = defs[operand];
      if (defId !== undefined && defId !== op.id) {
        if (!uses[operand]) uses[operand] = [];
        uses[operand].push(op.id);
        edges.push({ from: defId, to: op.id, value: operand });
      }
    }
  }

  return { defs, uses, edges };
}

/**
 * Given highlighted values, compute the set of node ids that participate
 * in those value's def-use chains.
 * @param {string[]} hiVals - currently highlighted SSA value names
 * @param {{ defs: Object, uses: Object }} graph
 * @returns {Set<number>} set of op ids to highlight
 */
export function getHighlightedNodes(hiVals, graph) {
  const hiNodes = new Set();
  for (const v of hiVals) {
    if (graph.defs[v] !== undefined) hiNodes.add(graph.defs[v]);
    for (const uid of graph.uses[v] || []) hiNodes.add(uid);
  }
  return hiNodes;
}

/**
 * Given highlighted values, compute separate sets for primary (clicked) nodes
 * and related (parent/child) nodes for differentiated highlighting.
 * @param {string[]} hiVals - currently highlighted SSA value names
 * @param {{ defs: Object, uses: Object, edges: Array }} graph
 * @returns {{ primary: Set<number>, related: Set<number> }}
 */
export function getHighlightedNodeSets(hiVals, graph) {
  const primary = new Set();
  const related = new Set();

  for (const v of hiVals) {
    // The defining node is the primary (clicked) node
    if (graph.defs[v] !== undefined) primary.add(graph.defs[v]);
    // Users of this value are children → related
    for (const uid of graph.uses[v] || []) related.add(uid);
  }

  // Find parents of primary nodes via incoming edges
  for (const edge of graph.edges) {
    if (primary.has(edge.to)) related.add(edge.from);
  }

  // Primary takes precedence over related
  for (const pid of primary) related.delete(pid);

  return { primary, related };
}
