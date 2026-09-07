/**
 * Boot-time hook. Fails startup on a misconfigured environment rather than
 * letting the first request discover it.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateRequiredEnv } = await import("./lib/env");
    validateRequiredEnv();
  }
}
