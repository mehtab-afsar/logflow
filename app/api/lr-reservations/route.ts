import { type NextRequest } from "next/server";
import { verifyAuth } from "@/lib/auth/verify";
import { createClient } from "@/lib/supabase/server";
import { parseBody } from "@/lib/api/validate";
import { apiErr, apiOk } from "@/lib/api/response";
import { apiErrFromRpc } from "@/lib/api/rpc-error";
import { reserveBlankLrSchema } from "@/features/consignments/schemas/reservation";

export const runtime = "nodejs";

const COLUMNS = `id, branch_id, lr_no, fy, reserved_date, batch_id, status,
  claimed_at, reconciled_consignment_id, reconciled_at, voided_at, void_reason`;

/** Open reservations for a branch (or the whole org), for the blank-forms panel. */
export async function GET(req: NextRequest) {
  const auth = await verifyAuth();
  if (!auth.ok) return apiErr(auth.error, auth.status);

  const sp = req.nextUrl.searchParams;
  const branchId = sp.get("branch_id");
  const status = sp.get("status");

  const supabase = await createClient();
  let query = supabase.from("lr_blank_reservations").select(COLUMNS).order("lr_no");
  if (branchId) query = query.eq("branch_id", branchId);
  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) return apiErr("Could not load reservations", 500);
  return apiOk(data);
}

/**
 * Reserves a batch of blank LR numbers for a branch — the digital half of
 * printing a physical checkbook for a driver who has no way to receive an
 * LR any other way. All validation lives in reserve_blank_lr_numbers(); see
 * that function and its migration for why the numbering itself is safe to
 * share with normal LR creation.
 */
export async function POST(req: NextRequest) {
  const auth = await verifyAuth();
  if (!auth.ok) return apiErr(auth.error, auth.status);

  const parsed = await parseBody(req, reserveBlankLrSchema);
  if (!parsed.ok) return apiErr(parsed.error, 422);
  const { branch_id, count, reserved_date } = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("reserve_blank_lr_numbers", {
    p_branch_id: branch_id,
    p_count: count,
    p_reserved_date: reserved_date ?? new Date().toISOString().slice(0, 10),
  });

  if (error) return apiErrFromRpc("reserve_blank_lr_numbers failed", error);
  return apiOk(data, 201);
}
