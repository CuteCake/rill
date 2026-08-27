/**
 * Natural filename comparison: digit runs compare numerically, so
 * "module.2.abi.mlir" sorts before "module.10.executable-targets.mlir".
 */
export function naturalCompare(a, b) {
  const re = /(\d+)|(\D+)/g;
  const as = String(a).match(re) || [];
  const bs = String(b).match(re) || [];
  const n = Math.min(as.length, bs.length);
  for (let i = 0; i < n; i++) {
    const x = as[i];
    const y = bs[i];
    const bothDigits = /^\d/.test(x) && /^\d/.test(y);
    if (bothDigits) {
      const diff = parseInt(x, 10) - parseInt(y, 10);
      if (diff) return diff;
    } else if (x !== y) {
      return x < y ? -1 : 1;
    }
  }
  return as.length - bs.length;
}
