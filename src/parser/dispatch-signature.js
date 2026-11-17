/** Split MLIR lists without splitting nested tensor types or shape expressions. */
export function splitTopLevel(text) {
  const parts = [];
  let start = 0, depth = 0, quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"' && text[i - 1] !== '\\') quoted = !quoted;
    if (quoted) continue;
    if ('<([{'.includes(c)) depth++;
    if ('>)]}'.includes(c) && text[i - 1] !== '-') depth--;
    if (c === ',' && depth === 0) { parts.push(text.slice(start, i).trim()); start = i + 1; }
  }
  if (text.slice(start).trim()) parts.push(text.slice(start).trim());
  return parts;
}

export function extractTypes(text) {
  const types = [];
  const pattern = /\b(?:tensor|memref|vector)<|![\w.]+(?:<)?|\b(?:f16|f32|f64|bf16|i1|i8|i16|i32|i64|index)\b/g;
  let m;
  while ((m = pattern.exec(text))) {
    let end = pattern.lastIndex;
    if (m[0].endsWith('<')) {
      let depth = 1;
      while (end < text.length && depth) {
        if (text[end] === '<') depth++;
        if (text[end] === '>' && text[end - 1] !== '-') depth--;
        end++;
      }
    }
    types.push(text.slice(m.index, end));
    pattern.lastIndex = end;
  }
  return [...new Set(types)];
}

export function parseDispatchSignature(node, text) {
  const signature = text.match(/=\s*\((.*)\)\s*\{$/);
  const args = signature ? splitTopLevel(signature[1]).map((s) => {
    const match = s.match(/^(%[\w.$]+)\s*:\s*(.*)$/);
    return match ? { name: match[1], type: extractTypes(match[2])[0] || match[2] } : null;
  }).filter(Boolean) : [];
  node.blockArguments = args.map((a) => a.name);
  node.blockArgumentTypes = args.map((a) => a.type);
  if (!signature) return;
  const header = text.slice(text.indexOf(node.opName) + node.opName.length, signature.index).trim();
  const call = header.match(/^(?:\[([^\]]*)\])?\s*\(([^)]*)\)\s*:\s*\((.*?)\)\s*->\s*([\s\S]*)$/);
  if (!call) return;
  const captures = call[2].match(/%[\w#.$]+/g) || [];
  const workload = call[1]?.match(/%[\w#.$]+/g) || [];
  const resultText = call[4].trim();
  const results = splitTopLevel(resultText.startsWith('(') ? resultText.slice(1, -1) : resultText);
  const operandTypes = splitTopLevel(call[3]);
  node.dispatchSignature = {
    captures, workload, operandTypes,
    results: results.map((r) => {
      const tied = r.match(/^(%[\w#.$]+)(?:\s|$)/)?.[1];
      return { tiedOperand: tied ? captures.indexOf(tied) : -1, type: tied ? operandTypes[captures.indexOf(tied)] : r };
    }),
  };
  node.operands = [...workload, ...captures];
  node.types = [...new Set([...operandTypes, ...node.dispatchSignature.results.map((r) => r.type)].filter(Boolean))];
}
