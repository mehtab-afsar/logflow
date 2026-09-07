/**
 * jsdom environment shims for the driver-queue tests.
 *
 * jsdom ships neither IndexedDB nor structuredClone. fake-indexeddb supplies
 * the former but calls the latter on every write — and because it does so
 * inside an event handler, a missing structuredClone surfaces as a hung
 * promise rather than an exception. Polyfill it before anything else loads.
 */
import { webcrypto } from "node:crypto";
import "fake-indexeddb/auto";

if (typeof globalThis.structuredClone !== "function") {
  /**
   * Minimal structured clone.
   *
   * Binary values (Blob, File, ArrayBuffer, typed arrays) are passed through by
   * reference rather than copied. Real structuredClone copies them, but they are
   * immutable in our usage and a v8.serialize round-trip cannot handle a Blob at
   * all — which is exactly how the POD jobs were silently failing to enqueue.
   */
  const clone = (value: unknown, seen: WeakMap<object, unknown>): unknown => {
    if (value === null || typeof value !== "object") return value;

    if (
      value instanceof Blob ||
      value instanceof ArrayBuffer ||
      ArrayBuffer.isView(value)
    ) {
      return value;
    }

    const obj = value as object;
    if (seen.has(obj)) return seen.get(obj);

    if (value instanceof Date) return new Date(value.getTime());
    if (value instanceof Map) {
      const out = new Map();
      seen.set(obj, out);
      for (const [k, v] of value) out.set(clone(k, seen), clone(v, seen));
      return out;
    }
    if (value instanceof Set) {
      const out = new Set();
      seen.set(obj, out);
      for (const v of value) out.add(clone(v, seen));
      return out;
    }
    if (Array.isArray(value)) {
      const out: unknown[] = [];
      seen.set(obj, out);
      for (const v of value) out.push(clone(v, seen));
      return out;
    }

    const out: Record<string, unknown> = {};
    seen.set(obj, out);
    for (const [k, v] of Object.entries(value)) out[k] = clone(v, seen);
    return out;
  };

  globalThis.structuredClone = (<T>(value: T): T =>
    clone(value, new WeakMap()) as T) as typeof structuredClone;
}

if (!globalThis.crypto) {
  Object.defineProperty(globalThis, "crypto", { value: webcrypto });
}
