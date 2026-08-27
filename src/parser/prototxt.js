/**
 * Protobuf Text Format Parser
 *
 * Parses protobuf text-format source (the syntax of Caffe .prototxt files)
 * into a plain message tree. This layer has no Caffe knowledge — mapping
 * the tree onto the op-array contract is done declaratively by a profile's
 * `import` section (see src/parser/import-map.js and docs/IMPORT_SPEC.md).
 *
 * Tree shape: a message is a plain object mapping fieldName → entry[]
 * (repeated fields are the general case). Each entry is either
 *   { v: string|number|boolean, line }  — scalar field
 *   { m: <message object>, line }       — sub-message field
 * Every message additionally carries a non-enumerable `__line` (1-indexed
 * line of the token that opened it), which feeds op.line for SourceView.
 *
 * Supported syntax: `key: value` (quoted strings with escapes, numbers,
 * bare enum idents, true/false), `key { ... }` and the equally legal
 * `key: { ... }`, angle-bracket messages `key < ... >`, short-form lists
 * `key: [a, b]` (each element becomes its own entry), repeated keys,
 * `#` comments, CRLF. Parsing is best-effort: malformed input yields
 * line-numbered messages in `errors` and as much tree as possible.
 */

const NUMBER_RE = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/;

/** Characters that terminate a bare token. */
const PUNCT = new Set(["{", "}", "<", ">", "[", "]", ":", ","]);

/** Any whitespace except newline (incl. NBSP/BOM — real files have them). */
const WS_RE = /[^\S\n]/;

function tokenize(src, errors) {
  const tokens = [];
  let line = 1;
  let i = 0;
  const n = src.length;

  while (i < n) {
    const c = src[i];
    if (c === "\n") {
      line++;
      i++;
      continue;
    }
    if (WS_RE.test(c)) {
      i++;
      continue;
    }
    if (c === "#") {
      while (i < n && src[i] !== "\n") i++;
      continue;
    }
    if (PUNCT.has(c)) {
      tokens.push({ t: "punct", v: c, line });
      i++;
      continue;
    }
    if (c === '"' || c === "'") {
      const quote = c;
      const startLine = line;
      let s = "";
      i++;
      let closed = false;
      while (i < n) {
        const ch = src[i];
        if (ch === "\\" && i + 1 < n) {
          const esc = src[i + 1];
          s += esc === "n" ? "\n" : esc === "t" ? "\t" : esc;
          i += 2;
          continue;
        }
        if (ch === quote) {
          closed = true;
          i++;
          break;
        }
        if (ch === "\n") break; // strings don't span lines in text format
        s += ch;
        i++;
      }
      if (!closed) errors.push(`line ${startLine}: unterminated string`);
      tokens.push({ t: "string", v: s, line: startLine });
      continue;
    }
    // Bare token: number, enum ident, bool, or field name
    let j = i;
    while (
      j < n &&
      !PUNCT.has(src[j]) &&
      src[j] !== "\n" &&
      !WS_RE.test(src[j]) &&
      src[j] !== "#" &&
      src[j] !== '"' &&
      src[j] !== "'"
    ) {
      j++;
    }
    tokens.push({ t: "ident", v: src.slice(i, j), line });
    i = j;
  }
  return tokens;
}

function newMessage(line) {
  const msg = {};
  Object.defineProperty(msg, "__line", { value: line, enumerable: false });
  return msg;
}

function convertScalar(raw) {
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (NUMBER_RE.test(raw)) return Number(raw);
  return raw; // bare enum ident (e.g. MAX, CONVOLUTION)
}

/**
 * Parse protobuf text format into a message tree.
 * @param {string} src - raw prototxt text
 * @returns {{ root: Object, errors: string[] }}
 */
export function parsePrototxt(src) {
  const errors = [];
  const tokens = tokenize(src, errors);
  let pos = 0;

  /** Append a scalar value for `key`; handles string concatenation. */
  function pushScalar(msg, key, tok) {
    let v;
    if (tok.t === "string") {
      // Adjacent string literals concatenate (protobuf text-format rule)
      v = tok.v;
      while (pos < tokens.length && tokens[pos].t === "string") {
        v += tokens[pos].v;
        pos++;
      }
    } else {
      v = convertScalar(tok.v);
    }
    (msg[key.v] || (msg[key.v] = [])).push({ v, line: tok.line });
  }

  function parseValue(msg, key) {
    const tok = tokens[pos];
    if (!tok) {
      errors.push(`line ${key.line}: missing value for "${key.v}"`);
      return;
    }
    if (tok.t === "punct" && (tok.v === "{" || tok.v === "<")) {
      pos++;
      parseSubMessage(msg, key, tok.v === "{" ? "}" : ">");
      return;
    }
    if (tok.t === "punct" && tok.v === "[") {
      pos++;
      while (pos < tokens.length) {
        const el = tokens[pos];
        if (el.t === "punct" && el.v === "]") {
          pos++;
          return;
        }
        if (el.t === "punct" && el.v === ",") {
          pos++;
          continue;
        }
        if (el.t === "punct") {
          errors.push(`line ${el.line}: unexpected "${el.v}" in list`);
          pos++;
          continue;
        }
        pos++;
        pushScalar(msg, key, el);
      }
      errors.push(`line ${key.line}: unclosed "[" for "${key.v}"`);
      return;
    }
    if (tok.t === "punct") {
      errors.push(`line ${tok.line}: unexpected "${tok.v}" after "${key.v}:"`);
      pos++;
      return;
    }
    pos++;
    pushScalar(msg, key, tok);
  }

  function parseSubMessage(msg, key, closer) {
    const sub = newMessage(key.line);
    (msg[key.v] || (msg[key.v] = [])).push({ m: sub, line: key.line });
    if (!parseFields(sub, closer)) {
      errors.push(`line ${key.line}: unclosed "${key.v}" block`);
    }
  }

  /** Parse fields into msg until `closer` (or EOF when closer is null). */
  function parseFields(msg, closer) {
    while (pos < tokens.length) {
      const tok = tokens[pos];
      if (tok.t === "punct" && tok.v === closer) {
        pos++;
        return true;
      }
      if (tok.t !== "ident") {
        errors.push(`line ${tok.line}: unexpected "${tok.v}"`);
        pos++;
        continue;
      }
      const key = tok;
      pos++;
      const next = tokens[pos];
      if (!next) {
        errors.push(`line ${key.line}: dangling field "${key.v}"`);
        return closer === null;
      }
      if (next.t === "punct" && next.v === ":") {
        pos++;
        parseValue(msg, key);
      } else if (next.t === "punct" && (next.v === "{" || next.v === "<")) {
        pos++;
        parseSubMessage(msg, key, next.v === "{" ? "}" : ">");
      } else {
        errors.push(
          `line ${key.line}: expected ":" or "{" after "${key.v}"`
        );
      }
    }
    return closer === null;
  }

  const root = newMessage(1);
  parseFields(root, null);
  return { root, errors };
}

/** All entries of a (repeated) field: entry[] or []. */
export function getAll(msg, fieldName) {
  return (msg && msg[fieldName]) || [];
}

/**
 * Resolve a dotted path to its first value: scalar, message object, or
 * undefined. Intermediate segments follow the first entry of each field.
 * getFirst(layer, "convolution_param.num_output") → 96
 */
export function getFirst(msg, dottedPath) {
  const parts = dottedPath.split(".");
  let cur = msg;
  for (let i = 0; i < parts.length; i++) {
    const entries = getAll(cur, parts[i]);
    if (entries.length === 0) return undefined;
    const entry = entries[0];
    if (i === parts.length - 1) return entry.m !== undefined ? entry.m : entry.v;
    if (entry.m === undefined) return undefined;
    cur = entry.m;
  }
  return undefined;
}

/**
 * All scalar values at a dotted path (repeated last segment). Intermediate
 * segments follow first entries. getValues(layer, "input_param.shape.dim")
 * → [1, 3, 224, 224]
 */
export function getValues(msg, dottedPath) {
  const parts = dottedPath.split(".");
  let cur = msg;
  for (let i = 0; i < parts.length - 1; i++) {
    const entry = getAll(cur, parts[i])[0];
    if (!entry || entry.m === undefined) return [];
    cur = entry.m;
  }
  return getAll(cur, parts[parts.length - 1])
    .filter((e) => e.v !== undefined)
    .map((e) => e.v);
}
