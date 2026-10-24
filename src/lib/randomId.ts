// Ids from secure random bytes (CodeQL js/insecure-randomness, phase 3d). Many ids end
// up as session or request ids sent to a model or connector, so none comes from
// Math.random(). crypto.getRandomValues works in every supported web view (macOS
// 10.15's too); crypto.randomUUID does not.

/** `length` lowercase hex characters from secure random bytes. */
export function randomHex(length = 8): string {
  const bytes = new Uint8Array(Math.ceil(length / 2));
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('').slice(0, length);
}

/** `<prefix>-<now>-<8 hex>`: unique, sortable by time, not guessable. */
export function randomId(prefix: string): string {
  return `${prefix}-${Date.now()}-${randomHex(8)}`;
}
