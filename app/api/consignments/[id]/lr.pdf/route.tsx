import { type NextRequest } from "next/server";
import { verifyAuth } from "@/lib/auth/verify";
import { createClient } from "@/lib/supabase/server";
import { apiErr } from "@/lib/api/response";
import { log } from "@/lib/logger";
import { registerPdfFonts } from "@/lib/pdf/fonts";
import { qrDataUrl } from "@/lib/pdf/qr";
import { getOrRender, lrPdfPath } from "@/lib/pdf/cache";
import { LrDocument, type CopyKey } from "@/lib/pdf/LrDocument";
import { loadLrPdfData } from "@/lib/pdf/lr-data";
import { env } from "@/lib/env";

export const runtime = "nodejs";   // fontkit needs Node, not Edge
export const maxDuration = 30;

registerPdfFonts();

const VALID_COPIES = new Set(["all", "consignor", "consignee", "driver", "office"]);

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const auth = await verifyAuth();
  if (!auth.ok) return apiErr(auth.error, auth.status);

  const sp = req.nextUrl.searchParams;
  const size = sp.get("size") === "a5" ? "a5" : "a4";
  const copiesParam = sp.get("copies") ?? "all";
  if (!VALID_COPIES.has(copiesParam)) return apiErr("Unknown copy requested", 400);
  const copies = copiesParam as CopyKey | "all";

  const supabase = await createClient();

  // User-scoped read: RLS is the tenancy check. A cross-org id yields no row.
  const loaded = await loadLrPdfData(supabase, id);
  if (!loaded) return apiErr("Not found", 404);
  const { lr, orgId, docVersion, lrNo, trackingToken } = loaded;

  try {
    const qr = await qrDataUrl(`${env.appUrl}/track/${trackingToken}`);
    const path = lrPdfPath(orgId, id, docVersion, size, copies);
    const { buffer, cached } = await getOrRender(path, () => (
      <LrDocument lr={lr} qr={qr} size={size} copies={copies} />
    ));

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${lrNo}.pdf"`,
        "Cache-Control": "private, max-age=0, must-revalidate",
        "X-Pdf-Cache": cached ? "hit" : "miss",
      },
    });
  } catch (err) {
    log.error("LR PDF render failed", { id, err: String(err) });
    return apiErr("Could not generate the lorry receipt", 500);
  }
}
