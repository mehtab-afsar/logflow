/**
 * REPO GUARD — the local login bypass must stay local.
 *
 * WHY: proxy.ts can sign a developer in automatically so they do not face a
 * login screen while working. That is a genuine auth bypass. If its guards
 * were ever loosened — or the env check quietly removed during a refactor —
 * a deployed instance would sign every visitor in as the owner.
 *
 * This test pins the guards to the source, so weakening them fails the build.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const proxy = readFileSync(join(process.cwd(), "proxy.ts"), "utf8");

describe("dev auto-login bypass", () => {
  it("exists in exactly one place in the proxy", () => {
    const matches = proxy.match(/signInWithPassword/g) ?? [];
    expect(matches).toHaveLength(1);
  });

  it("refuses to run when NODE_ENV is production", () => {
    expect(proxy).toMatch(/process\.env\.NODE_ENV\s*!==\s*["']production["']/);
  });

  it("requires an explicit opt-in flag", () => {
    expect(proxy).toMatch(/process\.env\.DEV_AUTO_LOGIN\s*===\s*["']1["']/);
  });

  it("hardcodes no credentials — they must come from the environment", () => {
    expect(proxy).toMatch(/process\.env\.DEV_AUTO_LOGIN_EMAIL/);
    expect(proxy).toMatch(/process\.env\.DEV_AUTO_LOGIN_PASSWORD/);
    // No email literal anywhere in the proxy.
    expect(proxy).not.toMatch(/["'][^"'\s]+@[^"'\s]+\.[a-z]{2,}["']/i);
  });

  it("only ever runs for a request that has no user", () => {
    // The whole block is inside `if (!user && ...)`.
    const block = /if\s*\(\s*\n?\s*!user\s*&&[\s\S]{0,600}?signInWithPassword/;
    expect(proxy).toMatch(block);
  });

  it("all four guards are in the same condition as the sign-in", () => {
    const start = proxy.indexOf("!user &&");
    const call = proxy.indexOf("signInWithPassword");
    expect(start).toBeGreaterThan(-1);
    expect(call).toBeGreaterThan(start);

    const condition = proxy.slice(start, call);
    expect(condition).toContain("NODE_ENV");
    expect(condition).toContain("DEV_AUTO_LOGIN");
    expect(condition).toContain("DEV_AUTO_LOGIN_EMAIL");
    expect(condition).toContain("DEV_AUTO_LOGIN_PASSWORD");
  });

  it("never applies to API routes — those keep the real auth boundary", () => {
    const apiGuard = proxy.indexOf('pathname.startsWith("/api/")');
    const bypass = proxy.indexOf("signInWithPassword");
    expect(apiGuard).toBeGreaterThan(-1);
    // The API short-circuit must return before the bypass can run.
    expect(apiGuard).toBeLessThan(bypass);
  });

  it("the real login page never reaches the bypass — it is public", () => {
    // Onboarding has landed: app/login/page.tsx now exists on purpose. What
    // still matters is that requests to it never fall into the auto-sign-in
    // branch below — isPublic() returns before the bypass block is reached.
    expect(existsSync(join(process.cwd(), "app", "login", "page.tsx"))).toBe(true);
    expect(proxy).toMatch(/PUBLIC_PATHS\s*=\s*new Set\(\[[^\]]*["']\/login["']/);
    const publicCheck = proxy.indexOf("isPublic(pathname)");
    const bypass = proxy.indexOf("signInWithPassword");
    expect(publicCheck).toBeGreaterThan(-1);
    expect(publicCheck).toBeLessThan(bypass);
  });

  it("legacy sign-in URLs redirect to the real login page, not a dead route", () => {
    // Bookmarks and browser autocomplete outlive a deleted route. /login is
    // now the destination itself, not a redirect source — see the test above.
    const config = readFileSync(join(process.cwd(), "next.config.ts"), "utf8");
    for (const path of ["/signin", "/sign-in"]) {
      expect(config).toContain(`source: "${path}"`);
    }
    expect(config).toMatch(/destination:\s*"\/login"/);
    expect(config).not.toContain('source: "/login"');
  });

  it("an unauthenticated visitor hitting a protected route is sent to the landing page", () => {
    expect(proxy).toMatch(/home\.pathname\s*=\s*["']\/["']/);
  });

  it("the committed env template ships the bypass switched OFF", () => {
    const example = readFileSync(join(process.cwd(), ".env.example"), "utf8");
    expect(example).toMatch(/^DEV_AUTO_LOGIN=\s*$/m);
    expect(example).toMatch(/^DEV_AUTO_LOGIN_PASSWORD=\s*$/m);
  });
});

describe("dev session switcher", () => {
  const route = readFileSync(
    join(process.cwd(), "app", "api", "dev", "session", "route.ts"),
    "utf8",
  );

  it("is gated on both NODE_ENV and the opt-in flag", () => {
    expect(route).toMatch(/process\.env\.NODE_ENV\s*!==\s*["']production["']/);
    expect(route).toMatch(/process\.env\.DEV_AUTO_LOGIN\s*===\s*["']1["']/);
  });

  it("returns 404 when disabled, so a deployed instance does not advertise it", () => {
    expect(route).toMatch(/if\s*\(!enabled\(\)\)\s*return\s*apiErr\(["']Not found["'],\s*404\)/);
  });

  it("takes the password from the environment, never a literal", () => {
    expect(route).toMatch(/process\.env\.DEV_AUTO_LOGIN_PASSWORD/);
    expect(route).not.toMatch(/password:\s*["'][^"']+["']/);
  });
});
