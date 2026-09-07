import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseBody } from "@/lib/api/validate";
import { apiErr, apiOk } from "@/lib/api/response";
import { log } from "@/lib/logger";
import { driverSchema } from "@/features/masters/schemas/masters";
import { requireMasterWrite, requireOwner, blank, CONFLICT_MESSAGE } from "@/lib/api/masters";

export const runtime = "nodejs";

const COLUMNS = "id, full_name, phone, dl_number, dl_expiry, language, created_at";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireMasterWrite();
  if (!guard.ok) return guard.response;

  const parsed = await parseBody(req, driverSchema);
  if (!parsed.ok) return apiErr(parsed.error, 422);
  const d = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("drivers")
    .update({
      full_name: d.full_name.trim(),
      phone: d.phone,
      dl_number: blank(d.dl_number),
      dl_expiry: blank(d.dl_expiry),
      language: d.language,
    })
    .eq("id", id)
    .select(COLUMNS)
    .maybeSingle();

  if (error) {
    if (error.code === "23505") return apiErr(CONFLICT_MESSAGE.drivers, 409);
    log.error("PATCH /api/drivers", { err: error.message });
    return apiErr("Could not save your changes", 500);
  }
  if (!data) return apiErr("Not found", 404);
  return apiOk(data);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireOwner();
  if (!guard.ok) return guard.response;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("drivers")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) return apiErr("Could not remove this driver", 500);
  if (!data) return apiErr("Not found", 404);
  return apiOk({ id, deleted: true });
}
