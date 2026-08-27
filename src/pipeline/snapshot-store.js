/**
 * Snapshot-series container: holds the ordered pass dumps, lazily parses
 * each on first access, and caches per-adjacent-pair match results.
 *
 * Parse/match/hash functions are injected so the store stays a pure,
 * node-testable data structure:
 *   parse(text, name)                → parsed payload (opaque to the store)
 *   match(prevParsed, nextParsed, overridesForPair) → MatchSet (opaque)
 *   hash(text)                       → content hash string
 *
 * Caches are unbounded by design: a 12-snapshot series of parsed ops is
 * small relative to the retained source texts.
 */
export function createSnapshotStore({ parse, match, hash }) {
  let snapshots = []; // [{ name, text, hash }]
  let overrides = []; // [{ pair: [i, i+1], action: "link"|"unlink", from, to }]
  const parseCache = new Map(); // idx → parsed
  const matchCache = new Map(); // i (meaning pair i↔i+1) → MatchSet

  function load(files) {
    snapshots = files.map((f) => ({
      name: f.name,
      text: f.text,
      hash: hash(f.text),
    }));
    overrides = [];
    parseCache.clear();
    matchCache.clear();
  }

  function getParsed(i) {
    if (i < 0 || i >= snapshots.length) return null;
    if (!parseCache.has(i)) {
      parseCache.set(i, parse(snapshots[i].text, snapshots[i].name));
    }
    return parseCache.get(i);
  }

  /** MatchSet between snapshots pairIdx and pairIdx+1. */
  function getMatches(pairIdx) {
    if (pairIdx < 0 || pairIdx >= snapshots.length - 1) return null;
    if (!matchCache.has(pairIdx)) {
      const forPair = overrides.filter((o) => o.pair[0] === pairIdx);
      matchCache.set(
        pairIdx,
        match(getParsed(pairIdx), getParsed(pairIdx + 1), forPair)
      );
    }
    return matchCache.get(pairIdx);
  }

  function addOverride(override) {
    overrides.push(override);
    matchCache.delete(override.pair[0]);
  }

  function removeOverride(index) {
    const [removed] = overrides.splice(index, 1);
    if (removed) matchCache.delete(removed.pair[0]);
  }

  function setOverrides(list) {
    overrides = [...list];
    matchCache.clear();
  }

  /** Registry/profile changes alter parsing — drop everything derived. */
  function invalidateParses() {
    parseCache.clear();
    matchCache.clear();
  }

  /** Cached pair MatchSet, or null — never triggers computation. */
  function peekMatches(pairIdx) {
    return matchCache.get(pairIdx) ?? null;
  }

  /**
   * Synchronously fill caches around index i (call from an idle callback).
   * @returns {boolean} true if anything new was computed
   */
  function warm(i) {
    const before = parseCache.size + matchCache.size;
    getParsed(i - 1);
    getParsed(i + 1);
    getMatches(i - 1);
    getMatches(i);
    return parseCache.size + matchCache.size > before;
  }

  return {
    load,
    getParsed,
    getMatches,
    peekMatches,
    addOverride,
    removeOverride,
    setOverrides,
    invalidateParses,
    warm,
    get length() {
      return snapshots.length;
    },
    get snapshots() {
      return snapshots;
    },
    get overrides() {
      return overrides;
    },
  };
}
