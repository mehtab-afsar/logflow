import { type NextRequest } from "next/server";
import { verifyAuth } from "@/lib/auth/verify";
import { createClient } from "@/lib/supabase/server";
import { parseBody } from "@/lib/api/validate";
import { apiErr, apiOk } from "@/lib/api/response";
import { log } from "@/lib/logger";
import { driverSchema } from "@/features/masters/schemas/masters";
import { requireMasterWrite, blank, CONFLICT_MESSAGE } from "@/lib/api/masters";

export const runtime = "nodejs";

const COLUMNS = "id, full_name, phone, dl_number, dl_expiry, language, created_at";

export async function GET() {
  const auth = await verifyAuth();
  if (!auth.ok) return apiErr(auth.error, auth.status);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("drivers").select(COLUMNS).is("deleted_at", null).order("full_name");

  if (error) return apiErr("Could not load drivers", 500);
  return apiOk(data);
}

export async function POST(req: NextRequest) {
  const guard = await requireMasterWrite();
  if (!guard.ok) return guard.response;

  const parsed = await parseBody(req, driverSchema);
  if (!parsed.ok) return apiErr(parsed.error, 422);
  const d = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("drivers")
    .insert({
      org_id: guard.ctx.orgId,
      full_name: d.full_name.trim(),
      phone: d.phone,
      dl_number: blank(d.dl_number),
      dl_expiry: blank(d.dl_expiry),
      // Picks the driver portal's dictionary; the driver never chooses it on
      // first open, which matters when he opens the link at a loading dock.
      language: d.language,
    })
    .select(COLUMNS)
    .single();

  if (error) {
    if (error.code === "23505") return apiErr(CONFLICT_MESSAGE.drivers, 409);
    log.error("POST /api/drivers", { err: error.message });
    return apiErr("Could not save this driver", 500);
  }
  return apiOk(data, 201);
}
