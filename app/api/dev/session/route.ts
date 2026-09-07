import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { apiErr, apiOk } from "@/lib/api/response";

export const runtime = "nodejs";

/**
 * Dev-only session switcher.
 *
 * There is no login screen yet — onboarding comes later. The proxy signs every
 * page request in as the default account, and this route exists so a developer
 * (or the end-to-end suite) can act as a different role to check permissions.
 *
 * Gated exactly like the proxy bypass: refused outright unless NODE_ENV is not
 * production AND DEV_AUTO_LOGIN is explicitly enabled. Returns 404 rather than
 * 403 when disabled, so a deployed instance does not advertise its existence.
 */
const ROLES = ["owner", "dispatcher", "accounts", "viewer"] as const;
type Role = (typeof ROLES)[number];

const EMAIL: Record<Role, string> = {
  owner: "owner@example.test",
  dispatcher: "dispatch@example.test",
  accounts: "accounts@example.test",
  viewer: "viewer@example.test",
};

function enabled() {
  return process.env.NODE_ENV !== "production" && process.env.DEV_AUTO_LOGIN === "1";
}

export async function GET(req: NextRequest) {
  if (!enabled()) return apiErr("Not found", 404);

  const sp = req.nextUrl.searchParams;

  // `email` lets the end-to-end suite act as an account outside the demo org —
  // which is how tenancy isolation is proven. Dev-gated like everything else
  // here, and it still requires the account's real password.
  const explicitEmail = sp.get("email");
  const role = (sp.get("role") ?? "owner") as Role;

  if (!explicitEmail && !ROLES.includes(role)) {
    return apiErr(`Unknown role '${role}'`, 400);
  }

  const password = sp.get("password") ?? process.env.DEV_AUTO_LOGIN_PASSWORD;
  if (!password) return apiErr("DEV_AUTO_LOGIN_PASSWORD is not set", 500);

  const supabase = await createClient();
  await supabase.auth.signOut();

  const { data, error } = await supabase.auth.signInWithPassword({
    email: explicitEmail ?? EMAIL[role],
    password,
  });
  if (error) return apiErr(error.message, 401);

  return apiOk({ role: explicitEmail ? "custom" : role, email: data.user?.email });
}
