import { verifyAuth } from "@/lib/auth/verify";
import { createClient } from "@/lib/supabase/server";
import { apiErr, apiOk } from "@/lib/api/response";
import { apiErrFromRpc } from "@/lib/api/rpc-error";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await verifyAuth();
  if (!auth.ok) return apiErr(auth.error, auth.status);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("party_outstanding", { p_party_id: id });

  if (error) return apiErrFromRpc("GET /api/parties/[id]/outstanding", error);
  return apiOk(data);
}
