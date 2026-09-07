import { type NextRequest } from "next/server";
import { z } from "zod";
import { createAnonClient } from "@/lib/supabase/anon";
import { parseBody } from "@/lib/api/validate";
import { apiErr, apiOk } from "@/lib/api/response";

export const runtime = "nodejs";

const schema = z.object({
  kind: z.enum(["diesel", "toll", "loading", "unloading", "halting", "other"]),
  amount: z.number().min(0).max(9_999_999),
  litres: z.number().min(0).max(2000).optional().nullable(),
  receipt_path: z.string().max(500).optional().nullable(),
  client_id: z.string().uuid(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return apiErr(parsed.error, 422);

  const supabase = createAnonClient();
  const { data, error } = await supabase.rpc("driver_add_expense", {
    p_token: token,
    p_kind: parsed.data.kind,
    p_amount: parsed.data.amount,
    p_litres: parsed.data.litres ?? undefined,
    p_receipt_path: parsed.data.receipt_path ?? undefined,
    p_client_id: parsed.data.client_id,
  });

  if (error) {
    if (error.code === "42501") return apiErr("This link has expired", 410);
    return apiErr(error.message, 422);
  }

  return apiOk(data);
}
