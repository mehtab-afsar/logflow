import { verifyAuth, type AuthContext } from "@/lib/auth/verify";
import { apiErr } from "@/lib/api/response";

/**
 * Shared POLICY for the master tables — not shared queries.
 *
 * A generic handler factory over parties/vehicles/drivers was the obvious
 * first cut, but supabase-js resolves the three table types to a union it
 * cannot narrow, so the insert had to be cast to `any`. That is precisely the
 * untyped-client mistake this codebase refuses to repeat, and it would have
 * hidden a wrong column name until runtime. Each route keeps its own typed
 * query; only the rules live here, where they cannot drift apart.
 */

export const MASTER_WRITE_ROLES = ["owner", "dispatcher"] as const;

export type Guard =
  | { ok: true; ctx: AuthContext }
  | { ok: false; response: ReturnType<typeof apiErr> };

/** Authenticated, and allowed to write masters. */
export async function requireMasterWrite(): Promise<Guard> {
  const auth = await verifyAuth();
  if (!auth.ok) return { ok: false, response: apiErr(auth.error, auth.status) };

  if (!MASTER_WRITE_ROLES.includes(auth.ctx.role as (typeof MASTER_WRITE_ROLES)[number])) {
    return {
      ok: false,
      response: apiErr("Adding or editing records requires the owner or dispatcher role", 403),
    };
  }
  return { ok: true, ctx: auth.ctx };
}

/** Authenticated, and allowed to remove records. */
export async function requireOwner(): Promise<Guard> {
  const auth = await verifyAuth();
  if (!auth.ok) return { ok: false, response: apiErr(auth.error, auth.status) };
  if (auth.ctx.role !== "owner") {
    return { ok: false, response: apiErr("Only the owner can remove records", 403) };
  }
  return { ok: true, ctx: auth.ctx };
}

/** Postgres 23505, rewritten as something a dispatcher can act on. */
export const CONFLICT_MESSAGE = {
  parties: "A party with that name already exists",
  vehicles: "That vehicle registration is already on your fleet",
  drivers: "A driver with that phone number already exists",
} as const;

/**
 * "" → null.
 *
 * An untouched optional date arrives as an empty string from a form input, and
 * '' fails a `date` column and every format CHECK. Normalising once here keeps
 * that out of three route handlers.
 */
export function blank<T>(value: T | "" | undefined | null): T | null {
  return value === "" || value === undefined ? null : (value as T | null);
}
