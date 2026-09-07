import { type NextRequest } from "next/server";
import { verifyAuth } from "@/lib/auth/verify";
import { createClient } from "@/lib/supabase/server";
import { apiErr, apiOk } from "@/lib/api/response";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const auth = await verifyAuth();
  if (!auth.ok) return apiErr(auth.error, auth.status);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("consignments")
    .select("*")
    .eq("id", id)
    .single();

  // RLS turns a cross-tenant id into zero rows, so this is a 404 rather than a
  // 403: we must not confirm that another organisation's LR exists.
  if (error || !data) return apiErr("Not found", 404);

  return apiOk(data);
}
