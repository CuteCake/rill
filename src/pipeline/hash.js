/**
 * Synchronous content hash for snapshot drift detection in session files.
 * Two independent FNV-1a 32-bit lanes concatenated to 16 hex chars.
 * Not cryptographic — it only answers "is this the same file content the
 * session was saved against?" (SubtleCrypto is async and unavailable in
 * non-secure contexts like some file:// setups, so it is not used here.)
 */
export function contentHash(str) {
  let h1 = 0x811c9dc5;
  let h2 = 0xcbf29ce4;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ c, 0x01000193);
  }
  return (
    "fnv1a64:" +
    (h1 >>> 0).toString(16).padStart(8, "0") +
    (h2 >>> 0).toString(16).padStart(8, "0")
  );
}
