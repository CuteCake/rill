/**
 * AI authoring kit
 *
 * Assembles the one-shot paste for an AI assistant: a system prompt, the
 * two profile specs (PROFILE_SPEC.md + IMPORT_SPEC.md), and a sample of
 * the currently loaded file. The docs are inlined into the bundle at
 * build time via Vite ?raw imports, so the kit works in the offline
 * single-file build.
 *
 * The sample is NOT a raw prefix — real dumps open with walls of loc
 * aliases and constants, and a prefix can miss op types entirely (so the
 * assistant could never write rules for them). Instead it is built from
 * the parsed op array:
 *   RAW HEAD        - verbatim first lines (file syntax / framing)
 *   OP INVENTORY    - every distinct op with counts — always complete
 *   OP EXAMPLES     - one representative source line per distinct op
 *   REGION BODIES   - captured bodies (genericBody) of region ops,
 *                     deduplicated by body signature
 *   CONTEXT EXCERPT - the contiguous source slice densest in distinct
 *                     ops, for real structure (nesting, locs, types)
 * Only when nothing parsed (unknown format) does it fall back to a
 * head + tail slice of the raw text.
 */

import PROFILE_SPEC from "../../docs/PROFILE_SPEC.md?raw";
import IMPORT_SPEC from "../../docs/IMPORT_SPEC.md?raw";
import { getBodyOps } from "../extensions/matcher.js";

/** Keep the pasted sample a reasonable size for a chat window. */
const MAX_SAMPLE_CHARS = 24000;
const HEAD_LINES = 40;
const MAX_LINE_CHARS = 220;
const MAX_EXAMPLES = 80;
const MAX_BODIES = 3;
const MAX_BODY_CHARS = 1200;
const WINDOW_OPS = 50;

const SYSTEM_PROMPT = `You are helping me author a profile for Rill, a dataflow-graph
visualizer for compiler IR (MLIR) and neural-network descriptions (Caffe
prototxt). A profile is a single JSON file of declarative rules — no code.

Your task: read the two specification documents below, then produce ONE
profile JSON for the sample input at the end.

Rules:
- Output a single JSON object and nothing else — no markdown fences, no
  commentary — so I can save it straight to a .json file.
- If the sample is MLIR: write dialect rules (dialects / classify /
  regions / summarize) for the dialects that appear. Do not add an
  "import" section.
- If the sample is a prototxt-style network: write an "import" section
  mapping its fields (see IMPORT_SPEC.md), plus dialects / classify /
  summarize rules for its layer types.
- The sample is auto-generated from my file: OP INVENTORY is a COMPLETE
  list of every distinct op — make sure every dialect in it has a color
  and every op is either covered by a rule or intentionally left to the
  "compute" default. The other sections are excerpts for context.
- Prefer exact opName matchers over opNameContains. Put specific rules
  before general ones — rule lists are first-match-wins.
- I will load your JSON in the app. If it is rejected, I will paste the
  validation errors back verbatim; reply with the full corrected JSON.
  I may also paste per-op "Profile debug" output showing which rule
  matched each op — use it to fix misclassifications.`;

function fence(title, body) {
  return `\n\n───────── ${title} ─────────\n\n${body.trim()}\n`;
}

function truncLine(s, max = MAX_LINE_CHARS) {
  s = (s || "").trim();
  return s.length > max ? s.slice(0, max) + " …" : s;
}

function section(title, body) {
  return `── ${title} ──\n${body}`;
}

/** Head + tail fallback for files nothing could parse. */
function rawFallback(source) {
  if (source.length <= MAX_SAMPLE_CHARS) return source;
  const head = source.slice(0, Math.floor(MAX_SAMPLE_CHARS * 0.65));
  const tail = source.slice(-Math.floor(MAX_SAMPLE_CHARS * 0.3));
  return head + "\n… (middle omitted) …\n" + tail;
}

/**
 * Build a structured, representative sample from the parsed ops.
 * @param {string} source - raw file content
 * @param {Array<Object>} ops - parsed op array (may be empty)
 * @returns {string}
 */
export function buildSmartSample(source, ops) {
  const named = (ops || []).filter((o) => o.opName);
  if (named.length === 0) return rawFallback(source || "");

  const lines = (source || "").split("\n");
  const parts = [];

  // RAW HEAD — the file's own framing (module header, first blocks)
  parts.push(
    section(
      `RAW HEAD (first ${Math.min(HEAD_LINES, lines.length)} lines, verbatim)`,
      lines.slice(0, HEAD_LINES).map((l) => truncLine(l)).join("\n")
    )
  );

  // OP INVENTORY — complete by construction
  const opCounts = new Map();
  const dialectCounts = new Map();
  const firstOp = new Map(); // opName → representative op
  for (const op of named) {
    opCounts.set(op.opName, (opCounts.get(op.opName) || 0) + 1);
    if (op.dialect) {
      dialectCounts.set(op.dialect, (dialectCounts.get(op.dialect) || 0) + 1);
    }
    // Prefer a shortish real line over a giant constant as the example
    const prev = firstOp.get(op.opName);
    if (!prev || (prev.trimmed || "").length > 400) firstOp.set(op.opName, op);
  }
  const byCount = [...opCounts.entries()].sort((a, b) => b[1] - a[1]);
  const dialectLine = [...dialectCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([d, n]) => `${d} (${n})`)
    .join(", ");
  parts.push(
    section(
      `OP INVENTORY (complete — ${opCounts.size} distinct ops, ${named.length} total)`,
      `dialects: ${dialectLine}\n` +
        byCount.map(([name, n]) => `${String(n).padStart(5)}× ${name}`).join("\n")
    )
  );

  // OP EXAMPLES — one representative line per distinct op
  const exampleOps = byCount.slice(0, MAX_EXAMPLES);
  const omitted = byCount.length - exampleOps.length;
  parts.push(
    section(
      "OP EXAMPLES (one representative line per op)",
      exampleOps
        .map(([name]) => {
          const op = firstOp.get(name);
          return `${name}\n    ${truncLine(op.trimmed || op.raw)}`;
        })
        .join("\n") +
        (omitted > 0
          ? `\n(${omitted} rarer ops without an example — all are listed in the inventory)`
          : "")
    )
  );

  // REGION BODIES — distinct captured bodies, for `when` body rules
  const bodies = [];
  const seenSigs = new Set();
  for (const op of named) {
    if (!op.genericBody || op.genericBody.length === 0) continue;
    const sig = [...getBodyOps(op)].sort().join(",") + "|" + (op.attrs._iters || []).join(",");
    if (seenSigs.has(sig)) continue;
    seenSigs.add(sig);
    let text = op.genericBody.join("\n");
    if (text.length > MAX_BODY_CHARS) text = text.slice(0, MAX_BODY_CHARS) + "\n…";
    bodies.push(`${op.opName} (line ${op.line}):\n${text}`);
    if (bodies.length >= MAX_BODIES) break;
  }
  if (bodies.length > 0) {
    parts.push(
      section("REGION BODIES (distinct captured bodies of region ops)", bodies.join("\n\n"))
    );
  }

  // CONTEXT EXCERPT — the contiguous window densest in distinct ops
  const used = parts.join("\n\n").length;
  const budget = MAX_SAMPLE_CHARS - used;
  if (budget > 1500 && named.length > 1) {
    const W = Math.min(WINDOW_OPS, named.length);
    let best = 0;
    let bestDistinct = -1;
    const window = new Map(); // opName → count inside window
    for (let i = 0; i < named.length; i++) {
      const name = named[i].opName;
      window.set(name, (window.get(name) || 0) + 1);
      if (i >= W) {
        const out = named[i - W].opName;
        const n = window.get(out) - 1;
        if (n === 0) window.delete(out);
        else window.set(out, n);
      }
      if (i >= W - 1 && window.size > bestDistinct) {
        bestDistinct = window.size;
        best = i - W + 1;
      }
    }
    const from = named[best].line;
    const to = named[Math.min(best + W - 1, named.length - 1)].line;
    let excerpt = lines
      .slice(from - 1, to)
      .map((l) => truncLine(l))
      .join("\n");
    if (excerpt.length > budget) excerpt = excerpt.slice(0, budget) + "\n…";
    parts.push(
      section(
        `CONTEXT EXCERPT (contiguous lines ${from}–${to}, the op-densest slice)`,
        excerpt
      )
    );
  }

  return parts.join("\n\n");
}

/**
 * Build the full clipboard payload.
 * @param {string} source - currently loaded file content
 * @param {string} fileName - its name, shown to the assistant
 * @param {Array<Object>} ops - parsed op array for smart sampling
 * @returns {string}
 */
export function buildAiKit(source, fileName, ops) {
  return (
    SYSTEM_PROMPT +
    fence("SPEC 1/2 · docs/PROFILE_SPEC.md", PROFILE_SPEC) +
    fence("SPEC 2/2 · docs/IMPORT_SPEC.md", IMPORT_SPEC) +
    fence(`SAMPLE INPUT · ${fileName} (auto-generated)`, buildSmartSample(source, ops))
  );
}
