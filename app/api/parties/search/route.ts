import { type NextRequest } from "next/server";
import { verifyAuth } from "@/lib/auth/verify";
import { createClient } from "@/lib/supabase/server";
import { apiErr, apiOk } from "@/lib/api/response";

export const runtime = "nodejs";

/** Autocomplete for the LR form: three letters in, name + GSTIN + city out. */
export async function GET(req: NextRequest) {
  const auth = await verifyAuth();
  if (!auth.ok) return apiErr(auth.error, auth.status);

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();

  const supabase = await createClient();
  let query = supabase
    .from("parties")
    .select("id, name, gstin, state_code, phone, addresses")
    .is("deleted_at", null)
    .order("name")
    .limit(20);

  if (q.length > 0) query = query.ilike("name", `%${q}%`);

  const { data, error } = await query;
  if (error) return apiErr("Could not search parties", 500);

  return apiOk(data);
}
