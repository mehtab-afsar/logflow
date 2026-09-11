/**
 * A job/client id, everywhere `crypto.randomUUID()` might not be.
 *
 * `randomUUID()` is gated to "secure contexts" by spec — HTTPS, or exactly
 * `localhost`. A phone reaching this app over the LAN during development
 * (`http://192.168.x.x:3000`, the address ShareButtons deliberately sends
 * instead of a useless `localhost` link — see ShareButtons.tsx) is neither,
 * so `crypto.randomUUID` is `undefined` there and calling it throws a
 * TypeError. That throw happened inside `recordMilestone`'s own try/catch, so
 * every tap failed before the queue was ever touched, with nothing on screen
 * or in a console to say so — this is the fix for a driver tapping "Loaded"
 * and having it do, visibly, nothing.
 *
 * `crypto.getRandomValues()` has no such restriction — it is the primitive
 * `randomUUID()` itself is built on — so it is the fallback rather than
 * `Math.random()`. These ids are only ever a local dedup key (the unique
 * index on (consignment_id, client_id) is what actually matters), not a
 * security boundary, so a same-quality-randomness UUID v4 is exactly as good
 * as the one the built-in function would have produced.
 */
export function newId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();

  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10xx
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
