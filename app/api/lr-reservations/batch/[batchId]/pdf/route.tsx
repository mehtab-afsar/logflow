import { renderToBuffer } from "@react-pdf/renderer";
import { verifyAuth } from "@/lib/auth/verify";
import { createClient } from "@/lib/supabase/server";
import { apiErr } from "@/lib/api/response";
import { log } from "@/lib/logger";
import { registerPdfFonts } from "@/lib/pdf/fonts";
import { Document } from "@react-pdf/renderer";
import { LrPages } from "@/lib/pdf/LrDocument";
import { blankLrData } from "@/lib/pdf/blank-lr-data";

export const runtime = "nodejs";
export const maxDuration = 30;

registerPdfFonts();

/**
 * The physical checkbook, printed as one PDF: every reservation in a batch,
 * blank, in one document — so the blank form and a real LR share the exact
 * same rendering path (LrPages) instead of a second hand-drawn version that
 * could drift from what one actually looks like.
 *
 * Not cached: unlike a real LR, which is reprinted often as it moves through
 * its lifecycle, a batch is rendered once, at the moment it is reserved.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ batchId: string }> }) {
  const { batchId } = await params;

  const auth = await verifyAuth();
  if (!auth.ok) return apiErr(auth.error, auth.status);

  const supabase = await createClient();

  // RLS is still the tenancy check — a batch belonging to another org
  // resolves to zero rows here, same 404 either way.
  const { data: reservations } = await supabase
    .from("lr_blank_reservations")
    .select("lr_no, reserved_date, branch_id")
    .eq("batch_id", batchId)
    .order("lr_no");

  if (!reservations || reservations.length === 0) return apiErr("Not found", 404);

  const [{ data: org }, { data: branch }] = await Promise.all([
    supabase.from("organisations")
      .select("legal_name, gstin, transin, address, state_code, risk_clause")
      .eq("id", auth.ctx.orgId).single(),
    supabase.from("branches").select("name, city").eq("id", reservations[0].branch_id).single(),
  ]);

  if (!org || !branch) return apiErr("Not found", 404);

  try {
    const buffer = await renderToBuffer(
      <Document title={`Blank LR batch ${batchId}`} author={org.legal_name}>
        {reservations.map((r) => (
          <LrPages key={r.lr_no} lr={blankLrData(r, org, branch)} qr="" copies="all" blank />
        ))}
      </Document>,
    );

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="blank-lr-batch.pdf"`,
        "Cache-Control": "private, max-age=0, must-revalidate",
      },
    });
  } catch (err) {
    log.error("Blank LR batch PDF render failed", { batchId, err: String(err) });
    return apiErr("Could not generate the blank forms", 500);
  }
}
