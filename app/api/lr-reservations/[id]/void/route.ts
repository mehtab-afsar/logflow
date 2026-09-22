import { type NextRequest } from "next/server";
import { verifyAuth } from "@/lib/auth/verify";
import { createClient } from "@/lib/supabase/server";
import { parseBody } from "@/lib/api/validate";
import { apiErr, apiOk } from "@/lib/api/response";
import { apiErrFromRpc } from "@/lib/api/rpc-error";
import { voidReservationSchema } from "@/features/consignments/schemas/reservation";

export const runtime = "nodejs";

/**
 * Permanent — a spoiled or lost blank form's number is retired, never
 * reused, because paper with that number on it may already exist in the
 * world. See void_blank_lr_reservation() for why a reason is mandatory.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const auth = await verifyAuth();
  if (!auth.ok) return apiErr(auth.error, auth.status);

  const parsed = await parseBody(req, voidReservationSchema);
  if (!parsed.ok) return apiErr(parsed.error, 422);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("void_blank_lr_reservation", {
    p_reservation_id: id,
    p_reason: parsed.data.reason,
  });

  if (error) return apiErrFromRpc("void_blank_lr_reservation failed", error);
  return apiOk(data);
}
