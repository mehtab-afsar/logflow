import { defineConfig, devices } from "@playwright/test";
import { config } from "dotenv";

config({ path: ".env.local" });

// One source of truth for where the suite points. The dev server does not
// always own port 3000 — a second local Supabase stack on the machine forces
// this project onto another port — so baseURL and the webServer health check
// must move together or Playwright starts a duplicate server it then ignores.
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const PORT = new URL(BASE_URL).port || "3000";

export default defineConfig({
  testDir: "./e2e",
  // The seed is shared state and the LR counter is global: parallel runs would
  // race on both.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "line" : "list",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: `npm run dev -- --port ${PORT}`,
    // The suite drives far more traffic from one IP than any real driver.
    // Raised here only; production keeps the protective defaults.
    env: { RATE_LIMIT_DRIVER_PER_MIN: "10000", RATE_LIMIT_TRACK_PER_MIN: "10000" },
    // The landing page: public, and it exists whether or not auth is configured.
    url: `${BASE_URL}/`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      // These belong to the device-specific projects below; running them here
      // as well would double-consume the trips they advance.
      // deck-shots captures marketing screenshots; it asserts nothing about
      // behaviour, so it is run on demand via `npm run deck:shots`.
      testIgnore: /driver-portal\.spec\.ts|tracking-nojs\.spec\.ts|deck-shots\.spec\.ts/,
    },
    // The driver portal is used one-handed on a mid-range Android.
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /driver-portal\.spec\.ts/ },
    // The tracking page must render in WhatsApp's in-app browser, JS or not.
    {
      name: "nojs",
      use: { ...devices["Desktop Chrome"], javaScriptEnabled: false },
      testMatch: /tracking-nojs\.spec\.ts/,
    },
  ],
});
