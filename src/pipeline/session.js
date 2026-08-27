/**
 * Session serialization: a saveable "debug session" describing a snapshot
 * series by reference (names + content hashes — never embedded IR),
 * tracked probes, manual mapping overrides, and notes.
 *
 * The build ships as a single HTML file often opened via file://, so
 * "save" means download-a-JSON and "open" means re-picking the dump files;
 * attachFiles() re-associates them with the saved refs.
 */

import { contentHash } from "./hash.js";
import { SESSION_KIND, SESSION_VERSION, validateSession } from "./session-validate.js";

/**
 * Build a plain session object ready for JSON.stringify.
 * @param {Object} args
 *   name, notes, created — metadata (created supplied by the caller)
 *   snapshots — [{name, text|hash, opCount?}] (store.snapshots works as-is)
 *   probes    — [{id, name, color, originIndex, keys, notes}]
 *   overrides — [{pair, action, from, to}]
 *   views     — story-mode payload, round-tripped verbatim
 */
export function buildSession({ name, notes, created, snapshots, probes, overrides, views }) {
  return {
    kind: SESSION_KIND,
    version: SESSION_VERSION,
    ...(name ? { name } : {}),
    ...(created ? { created } : {}),
    ...(notes ? { notes } : {}),
    snapshots: (snapshots || []).map((s) => ({
      file: s.name ?? s.file,
      hash: s.hash ?? contentHash(s.text),
      ...(s.opCount !== undefined ? { opCount: s.opCount } : {}),
    })),
    probes: (probes || []).map((p) => ({
      id: p.id,
      ...(p.name ? { name: p.name } : {}),
      ...(p.color ? { color: p.color } : {}),
      originIndex: p.originIndex,
      keys: [...p.keys],
      ...(p.notes ? { notes: p.notes } : {}),
    })),
    overrides: (overrides || []).map((o) => ({
      pair: [...o.pair],
      action: o.action,
      from: [...o.from],
      to: [...o.to],
    })),
    views: views ? JSON.parse(JSON.stringify(views)) : [],
  };
}

/** Parse + validate JSON text. @returns {{ok, errors, session}} */
export function loadSession(text) {
  let obj;
  try {
    obj = JSON.parse(text);
  } catch (e) {
    return { ok: false, errors: [`not valid JSON — ${e.message}`], session: null };
  }
  const { ok, errors } = validateSession(obj);
  return { ok, errors, session: ok ? obj : null };
}

/** True if parsed JSON looks like a session (routes file-open dispatch). */
export function isSessionObject(obj) {
  return typeof obj === "object" && obj !== null && obj.kind === SESSION_KIND;
}

/**
 * Re-associate user-picked files with a session's snapshot refs.
 * Matches by exact name first, then by content hash under any name.
 *
 * @param {Array} refs  session.snapshots [{file, hash}]
 * @param {Array} files [{name, text}]
 * @returns {{
 *   ordered: Array<{ref, file: {name,text}|null, hashMismatch: boolean}>,
 *   warnings: string[],
 *   missing: string[],
 * }} ordered follows the session's snapshot order.
 */
export function attachFiles(refs, files) {
  const withHash = files.map((f) => ({ ...f, hash: contentHash(f.text) }));
  const unclaimed = new Set(withHash);
  const ordered = [];
  const warnings = [];
  const missing = [];

  for (const ref of refs) {
    let pick = [...unclaimed].find((f) => f.name === ref.file) || null;
    if (!pick) {
      pick = [...unclaimed].find((f) => f.hash === ref.hash) || null;
      if (pick) {
        warnings.push(
          `"${ref.file}" was attached from "${pick.name}" (matched by content)`
        );
      }
    }
    if (pick) {
      unclaimed.delete(pick);
      const hashMismatch = pick.hash !== ref.hash;
      if (hashMismatch) {
        warnings.push(
          `"${ref.file}" content differs from when this session was saved — ` +
            `mappings and probes may be stale`
        );
      }
      ordered.push({ ref, file: { name: pick.name, text: pick.text }, hashMismatch });
    } else {
      missing.push(ref.file);
      ordered.push({ ref, file: null, hashMismatch: false });
    }
  }
  if (missing.length) {
    warnings.push(`missing snapshot file(s): ${missing.join(", ")}`);
  }
  return { ordered, warnings, missing };
}
