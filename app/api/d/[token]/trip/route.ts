import { type NextRequest } from "next/server";
import { createAnonClient } from "@/lib/supabase/anon";
import { apiErr, apiOk } from "@/lib/api/response";

export const runtime = "nodejs";

/**
 * Driver trip card. No session — the token IS the credential.
 *
 * The RPC re-checks expiry and revocation on every call, so a withdrawn link
 * stops working immediately on every surface rather than at the next refresh.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const supabase = createAnonClient();
  const { data, error } = await supabase.rpc("driver_trip", { p_token: token });

  if (error) {
    // 42501 is the RPC's "expired or withdrawn" signal.
    if (error.code === "42501") return apiErr("This link has expired", 410);
    return apiErr("Could not load this trip", 500);
  }
  if (!data) return apiErr("Not found", 404);

  return apiOk(data);
}
