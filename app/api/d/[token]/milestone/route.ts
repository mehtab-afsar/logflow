import { type NextRequest } from "next/server";
import { z } from "zod";
import { createAnonClient } from "@/lib/supabase/anon";
import { parseBody } from "@/lib/api/validate";
import { apiErr, apiOk } from "@/lib/api/response";
import { MILESTONES } from "@/lib/consignments/state-machine";

export const runtime = "nodejs";

const schema = z.object({
  kind: z.enum(MILESTONES),
  at: z.iso.datetime().optional(),
  note: z.string().max(300).optional(),
  client_id: z.string().max(64).optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return apiErr(parsed.error, 422);

  const supabase = createAnonClient();
  const { data, error } = await supabase.rpc("driver_milestone", {
    p_token: token,
    p_kind: parsed.data.kind,
    p_at: parsed.data.at ?? new Date().toISOString(),
    p_note: parsed.data.note ?? undefined,
  });

  if (error) {
    if (error.code === "42501") return apiErr("This link has expired", 410);
    if (error.code === "22023") return apiErr(error.message, 422);
    // A closed trip is a conflict, not a retryable failure.
    return apiErr(error.message, 409);
  }

  return apiOk(data);
}
