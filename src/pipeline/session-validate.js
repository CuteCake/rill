/**
 * Session Validator
 *
 * Validates a Rill debug-session object (parsed JSON) in the same style as
 * the profile validator: exact paths, "did you mean" hints, errors written
 * to be pasted back into an authoring loop. The canonical definition lives
 * in docs/schema/session.schema.json; test/session-schema.test.js keeps
 * the two from drifting.
 *
 * `views` is the story-mode reservation: it must be an array of objects,
 * but item contents are deliberately unchecked and round-tripped verbatim.
 */

import { checkKeys, badEnum } from "../extensions/validate.js";

export const SESSION_KIND = "rill-session";
export const SESSION_VERSION = "1.0.0";

const TOP_KEYS = [
  "$schema",
  "kind",
  "version",
  "name",
  "created",
  "notes",
  "snapshots",
  "probes",
  "overrides",
  "views",
];
const SNAPSHOT_KEYS = ["file", "hash", "opCount"];
const PROBE_KEYS = ["id", "name", "color", "originIndex", "keys", "notes"];
const OVERRIDE_KEYS = ["pair", "action", "from", "to"];
const OVERRIDE_ACTIONS = ["link", "unlink"];

const isStringArray = (v) =>
  Array.isArray(v) && v.every((x) => typeof x === "string");

export function validateSession(session) {
  const errors = [];
  if (typeof session !== "object" || session === null || Array.isArray(session)) {
    return { ok: false, errors: ["session: must be a JSON object"] };
  }
  checkKeys(session, TOP_KEYS, "session", errors);

  if (session.kind !== SESSION_KIND) {
    errors.push(
      `session.kind: must be "${SESSION_KIND}" (got ${JSON.stringify(session.kind)})`
    );
  }
  if (typeof session.version !== "string" || !/^\d+\.\d+\.\d+$/.test(session.version)) {
    errors.push(`session.version: must be a semver string like "${SESSION_VERSION}"`);
  } else if (session.version.split(".")[0] !== SESSION_VERSION.split(".")[0]) {
    errors.push(
      `session.version: major version ${session.version} is not supported ` +
        `(this build reads ${SESSION_VERSION.split(".")[0]}.x.y)`
    );
  }
  for (const k of ["name", "created", "notes"]) {
    if (session[k] !== undefined && typeof session[k] !== "string") {
      errors.push(`session.${k}: must be a string`);
    }
  }

  if (!Array.isArray(session.snapshots) || session.snapshots.length === 0) {
    errors.push("session.snapshots: must be a non-empty array");
  } else {
    session.snapshots.forEach((s, i) => {
      const path = `session.snapshots[${i}]`;
      if (typeof s !== "object" || s === null || Array.isArray(s)) {
        errors.push(`${path}: must be an object`);
        return;
      }
      checkKeys(s, SNAPSHOT_KEYS, path, errors);
      if (typeof s.file !== "string" || !s.file) {
        errors.push(`${path}.file: must be a non-empty string`);
      }
      if (typeof s.hash !== "string" || !s.hash) {
        errors.push(`${path}.hash: must be a non-empty string`);
      }
      if (s.opCount !== undefined && !Number.isInteger(s.opCount)) {
        errors.push(`${path}.opCount: must be an integer`);
      }
    });
  }

  if (session.probes !== undefined) {
    if (!Array.isArray(session.probes)) {
      errors.push("session.probes: must be an array");
    } else {
      session.probes.forEach((p, i) => {
        const path = `session.probes[${i}]`;
        if (typeof p !== "object" || p === null || Array.isArray(p)) {
          errors.push(`${path}: must be an object`);
          return;
        }
        checkKeys(p, PROBE_KEYS, path, errors);
        if (typeof p.id !== "string" || !p.id) {
          errors.push(`${path}.id: must be a non-empty string`);
        }
        if (!Number.isInteger(p.originIndex) || p.originIndex < 0) {
          errors.push(`${path}.originIndex: must be a non-negative integer`);
        }
        if (!isStringArray(p.keys) || p.keys.length === 0) {
          errors.push(`${path}.keys: must be a non-empty array of node-key strings`);
        }
        for (const k of ["name", "color", "notes"]) {
          if (p[k] !== undefined && typeof p[k] !== "string") {
            errors.push(`${path}.${k}: must be a string`);
          }
        }
      });
    }
  }

  if (session.overrides !== undefined) {
    if (!Array.isArray(session.overrides)) {
      errors.push("session.overrides: must be an array");
    } else {
      session.overrides.forEach((o, i) => {
        const path = `session.overrides[${i}]`;
        if (typeof o !== "object" || o === null || Array.isArray(o)) {
          errors.push(`${path}: must be an object`);
          return;
        }
        checkKeys(o, OVERRIDE_KEYS, path, errors);
        if (
          !Array.isArray(o.pair) ||
          o.pair.length !== 2 ||
          !o.pair.every(Number.isInteger) ||
          o.pair[1] !== o.pair[0] + 1 ||
          o.pair[0] < 0
        ) {
          errors.push(`${path}.pair: must be two adjacent snapshot indices [i, i+1]`);
        }
        if (!OVERRIDE_ACTIONS.includes(o.action)) {
          badEnum(`${path}.action`, o.action, OVERRIDE_ACTIONS, errors);
        }
        if (!isStringArray(o.from) || !isStringArray(o.to)) {
          errors.push(`${path}.from/.to: must be arrays of node-key strings`);
        } else if (o.action === "link" && (o.from.length === 0 || o.to.length === 0)) {
          errors.push(`${path}: a "link" override needs non-empty from and to`);
        } else if (o.action === "unlink" && o.from.length === 0 && o.to.length === 0) {
          errors.push(`${path}: an "unlink" override needs at least one key`);
        }
      });
    }
  }

  if (session.views !== undefined) {
    if (!Array.isArray(session.views)) {
      errors.push("session.views: must be an array");
    } else {
      session.views.forEach((v, i) => {
        if (typeof v !== "object" || v === null || Array.isArray(v)) {
          errors.push(`session.views[${i}]: must be an object`);
        }
      });
    }
  }

  return { ok: errors.length === 0, errors };
}
