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

  it("there is no login page to bypass yet", () => {
    // Onboarding is a later phase. If a login route is added, the bypass, the
    // redirect below and next.config's redirects must be revisited together.
    expect(existsSync(join(process.cwd(), "app", "login", "page.tsx"))).toBe(false);
  });

  it("legacy sign-in URLs redirect into the app instead of 404ing", () => {
    // Bookmarks and browser autocomplete outlive a deleted route.
    const config = readFileSync(join(process.cwd(), "next.config.ts"), "utf8");
    for (const path of ["/login", "/signin", "/sign-in"]) {
      expect(config).toContain(`source: "${path}"`);
    }
    expect(config).toMatch(/destination:\s*"\/dashboard"/);
  });

  it("an unauthenticated visitor is sent to the landing page, not a dead route", () => {
    expect(proxy).toMatch(/home\.pathname\s*=\s*["']\/["']/);
    // Checked against code only: a comment may legitimately mention the word.
    const code = proxy.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    expect(code).not.toContain("/login");
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
