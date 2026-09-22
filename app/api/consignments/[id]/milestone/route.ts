import { type NextRequest } from "next/server";
import { z } from "zod";
import { verifyAuth } from "@/lib/auth/verify";
import { createClient } from "@/lib/supabase/server";
import { parseBody } from "@/lib/api/validate";
import { apiErr, apiOk } from "@/lib/api/response";
import { apiErrFromRpc } from "@/lib/api/rpc-error";

export const runtime = "nodejs";

const milestoneSchema = z.object({
  kind: z.enum(["loaded", "departed", "reached", "unloaded"]),
  at: z.iso.datetime().optional(),
  note: z.string().max(500).optional(),
});

/**
 * A milestone the office is recording because the driver phoned it in —
 * he has no smartphone to tap through the portal himself. Always attributed
 * "reported_via: phone" inside record_milestone_for_driver() itself, not a
 * client-supplied flag: this route exists for exactly one reason, so there
 * is nothing to make optional here.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const auth = await verifyAuth();
  if (!auth.ok) return apiErr(auth.error, auth.status);

  const parsed = await parseBody(req, milestoneSchema);
  if (!parsed.ok) return apiErr(parsed.error, 422);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("record_milestone_for_driver", {
    p_consignment_id: id,
    p_kind: parsed.data.kind,
    p_at: parsed.data.at ?? new Date().toISOString(),
    p_note: parsed.data.note,
  });

  if (error) return apiErrFromRpc("record_milestone_for_driver failed", error);
  return apiOk(data);
}
