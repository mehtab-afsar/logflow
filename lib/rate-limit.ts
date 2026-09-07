/**
 * In-memory sliding-window rate limiter.
 *
 * SCOPE: per process. This is deliberate for the MVP — adding Redis to a
 * single-instance pilot is cost without benefit. It MUST move to a shared
 * store before running more than one instance, or each instance will allow the
 * full quota independently.
 *
 * What it protects: the driver and tracking token endpoints. A 160-bit token
 * is not brute-forceable, but an unthrottled scanner still costs database
 * load, and these are the only unauthenticated write paths in the system.
 */
interface Bucket {
  count: number;
  resetAt: number;
}

const BUCKETS = new Map<string, Bucket>();
const MAX_ENTRIES = 10_000;

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();

  // Cheap eviction: drop expired entries once the map gets large, so a long
  // scan cannot grow this without bound.
  if (BUCKETS.size > MAX_ENTRIES) {
    for (const [k, b] of BUCKETS) {
      if (b.resetAt <= now) BUCKETS.delete(k);
    }
    if (BUCKETS.size > MAX_ENTRIES) BUCKETS.clear();
  }

  const bucket = BUCKETS.get(key);
  if (!bucket || bucket.resetAt <= now) {
    BUCKETS.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }

  bucket.count += 1;
  if (bucket.count > limit) {
    return {
      ok: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }
  return { ok: true, remaining: limit - bucket.count, retryAfterSeconds: 0 };
}

/**
 * Per-minute request budgets, overridable so an end-to-end suite (which drives
 * far more traffic from one IP than a real driver ever would) stays
 * deterministic. Production leaves them at the defaults.
 */
export const LIMITS = {
  driverApi: Number(process.env.RATE_LIMIT_DRIVER_PER_MIN ?? 30),
  tracking: Number(process.env.RATE_LIMIT_TRACK_PER_MIN ?? 60),
} as const;

/** Best-effort client IP behind Vercel / a proxy. */
export function clientIp(headers: Headers): string {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip") ||
    "unknown"
  );
}
