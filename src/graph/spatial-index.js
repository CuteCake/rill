/**
 * Spatial Index — grid-based spatial hash for fast hit-testing.
 *
 * Partitions nodes into a grid of cells so that point queries only
 * check the nodes in the relevant cell instead of all nodes.
 */

/**
 * Build a spatial hash grid from positioned layout nodes.
 *
 * @param {Array} nodes  - layout.nodes with {x, y, w, h, node}
 * @param {number} cellSize - grid cell size in world pixels (default 300)
 * @returns {{ query(wx, wy): Array }}
 */
export function buildSpatialGrid(nodes, cellSize = 300) {
  const grid = new Map();

  function key(cx, cy) {
    return `${cx},${cy}`;
  }

  for (const node of nodes) {
    const x1 = Math.floor(node.x / cellSize);
    const y1 = Math.floor(node.y / cellSize);
    const x2 = Math.floor((node.x + node.w) / cellSize);
    const y2 = Math.floor((node.y + node.h) / cellSize);

    for (let cx = x1; cx <= x2; cx++) {
      for (let cy = y1; cy <= y2; cy++) {
        const k = key(cx, cy);
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(node);
      }
    }
  }

  return {
    query(wx, wy) {
      const k = key(Math.floor(wx / cellSize), Math.floor(wy / cellSize));
      return grid.get(k) || [];
    },
  };
}
