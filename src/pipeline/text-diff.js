/**
 * Git-style text diff for matched ops across a pass.
 *
 * diffLines   — LCS line diff → [{type: "same"|"del"|"add", text}]
 * tokenDiff   — within-line token diff; pure SSA/loc-alias renames are
 *               classified separately ("ren") so renumbering noise doesn't
 *               drown the attribute change the user is hunting for
 * matchDiff   — full git-style rows for a match group (from-ops vs to-ops),
 *               with hunk-style context folding
 */

/**
 * Lines representing an op: its own line, any captured region body, and —
 * for imported formats — the full parameter list (op.trimmed only carries
 * a capped attr summary, so paramLines is what makes every attribute
 * visible to the diff).
 */
export function opTextBlock(op) {
  if (!op) return [];
  const lines = [op.trimmed];
  for (const l of op.genericBody || []) lines.push("  " + l);
  for (const l of op.paramLines || []) lines.push("  " + l);
  return lines;
}

const PAIR_CAP = 250000; // n*m ceiling for the LCS table

/** LCS diff over arrays of strings (lines or tokens). */
export function diffLines(a, b) {
  const n = a.length;
  const m = b.length;
  if (n * m > PAIR_CAP) {
    return [
      ...a.map((text) => ({ type: "del", text })),
      ...b.map((text) => ({ type: "add", text })),
    ];
  }
  const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] =
        a[i] === b[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ type: "same", text: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ type: "del", text: a[i] });
      i++;
    } else {
      out.push({ type: "add", text: b[j] });
      j++;
    }
  }
  while (i < n) out.push({ type: "del", text: a[i++] });
  while (j < m) out.push({ type: "add", text: b[j++] });
  return out;
}

const TOKEN_RE = /%[\w#.$]+|#[\w.$]+|[A-Za-z_][\w.$]*|\d+(?:\.\d+)?(?:e[+-]?\d+)?|\s+|./g;

export function tokenize(line) {
  return line.match(TOKEN_RE) || [];
}

/** Renumbering-only tokens: SSA values and attribute alias refs. */
const isRenameToken = (t) => /^%[\w#.$]+$/.test(t) || /^#[\w.$]+$/.test(t);

function mergeSpans(spans) {
  const out = [];
  for (const s of spans) {
    const last = out[out.length - 1];
    if (last && last.hl === s.hl) last.text += s.text;
    else out.push({ ...s });
  }
  return out;
}

/**
 * Token-level diff of one changed line pair.
 * @returns {{a: spans, b: spans}} spans = [{text, hl: null|"chg"|"ren"}]
 */
export function tokenDiff(aLine, bLine) {
  const d = diffLines(tokenize(aLine), tokenize(bLine));
  const aSpans = [];
  const bSpans = [];
  for (let k = 0; k < d.length; k++) {
    const e = d[k];
    if (e.type === "same") {
      aSpans.push({ text: e.text, hl: null });
      bSpans.push({ text: e.text, hl: null });
      continue;
    }
    if (e.type === "del") {
      const next = d[k + 1];
      if (
        next?.type === "add" &&
        isRenameToken(e.text) &&
        isRenameToken(next.text)
      ) {
        aSpans.push({ text: e.text, hl: "ren" });
        bSpans.push({ text: next.text, hl: "ren" });
        k++;
        continue;
      }
      aSpans.push({ text: e.text, hl: "chg" });
    } else {
      bSpans.push({ text: e.text, hl: "chg" });
    }
  }
  return { a: mergeSpans(aSpans), b: mergeSpans(bSpans) };
}

const CONTEXT = 2; // context lines kept around each change hunk

/**
 * Git-style diff rows for a match group.
 * @param {Array} fromOps ops on the previous-snapshot side
 * @param {Array} toOps   ops on the current-snapshot side
 * @returns {Array<{type: "context"|"del"|"add"|"skip", spans?, count?}>}
 */
export function matchDiff(fromOps, toOps) {
  const d = diffLines(fromOps.flatMap(opTextBlock), toOps.flatMap(opTextBlock));
  const rows = [];
  let k = 0;
  while (k < d.length) {
    if (d[k].type === "same") {
      rows.push({ type: "context", spans: [{ text: d[k].text, hl: null }] });
      k++;
      continue;
    }
    const dels = [];
    const adds = [];
    while (k < d.length && d[k].type === "del") dels.push(d[k++].text);
    while (k < d.length && d[k].type === "add") adds.push(d[k++].text);
    const pairs = Math.min(dels.length, adds.length);
    const tds = Array.from({ length: pairs }, (_, x) => tokenDiff(dels[x], adds[x]));
    dels.forEach((text, x) => {
      rows.push({
        type: "del",
        spans: x < pairs ? tds[x].a : [{ text, hl: null }],
      });
    });
    adds.forEach((text, x) => {
      rows.push({
        type: "add",
        spans: x < pairs ? tds[x].b : [{ text, hl: null }],
      });
    });
  }
  // Hunk folding: collapse long context runs to CONTEXT lines on each side
  const folded = [];
  let run = [];
  const flushRun = (isTail) => {
    if (run.length <= CONTEXT * 2 + 1) {
      folded.push(...run);
    } else {
      const head = folded.length === 0 ? 0 : CONTEXT; // no leading context at the very start
      const tail = isTail ? 0 : CONTEXT;
      folded.push(...run.slice(0, head));
      folded.push({ type: "skip", count: run.length - head - tail });
      if (tail) folded.push(...run.slice(-tail));
    }
    run = [];
  };
  for (const row of rows) {
    if (row.type === "context") run.push(row);
    else {
      flushRun(false);
      folded.push(row);
    }
  }
  flushRun(true);
  return folded;
}
