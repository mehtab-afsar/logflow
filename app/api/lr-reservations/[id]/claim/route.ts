import { verifyAuth } from "@/lib/auth/verify";
import { createClient } from "@/lib/supabase/server";
import { apiErr, apiOk } from "@/lib/api/response";
import { apiErrFromRpc } from "@/lib/api/rpc-error";

export const runtime = "nodejs";

/**
 * Idempotent by design (see claim_blank_lr_reservation) — the reconcile page
 * calls this on load, so a colleague reopening an abandoned "claimed" form
 * just picks it back up rather than being blocked.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const auth = await verifyAuth();
  if (!auth.ok) return apiErr(auth.error, auth.status);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("claim_blank_lr_reservation", { p_reservation_id: id });

  if (error) return apiErrFromRpc("claim_blank_lr_reservation failed", error);
  return apiOk(data);
}
