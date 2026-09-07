import { rateLimit, clientIp } from "@/lib/rate-limit";

describe("rate limiter", () => {
  it("allows up to the limit then refuses", () => {
    const key = `k-${Math.random()}`;
    for (let i = 0; i < 5; i += 1) {
      expect(rateLimit(key, 5, 60_000).ok).toBe(true);
    }
    const blocked = rateLimit(key, 5, 60_000);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("counts each key independently", () => {
    const a = `a-${Math.random()}`;
    const b = `b-${Math.random()}`;
    rateLimit(a, 1, 60_000);
    expect(rateLimit(a, 1, 60_000).ok).toBe(false);
    expect(rateLimit(b, 1, 60_000).ok).toBe(true);
  });

  it("reports the remaining budget", () => {
    const key = `r-${Math.random()}`;
    expect(rateLimit(key, 3, 60_000).remaining).toBe(2);
    expect(rateLimit(key, 3, 60_000).remaining).toBe(1);
  });

  it("resets after the window elapses", async () => {
    const key = `w-${Math.random()}`;
    expect(rateLimit(key, 1, 20).ok).toBe(true);
    expect(rateLimit(key, 1, 20).ok).toBe(false);   // still inside the window
    await new Promise((r) => setTimeout(r, 30));
    expect(rateLimit(key, 1, 20).ok).toBe(true);    // window has rolled over
  });

  it("extracts the client IP from proxy headers", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" }))).toBe("203.0.113.9");
    expect(clientIp(new Headers({ "x-real-ip": "203.0.113.5" }))).toBe("203.0.113.5");
    expect(clientIp(new Headers())).toBe("unknown");
  });
});
