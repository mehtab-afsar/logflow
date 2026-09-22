import { type NextRequest } from "next/server";
import { verifyAuth } from "@/lib/auth/verify";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiErr, apiOk } from "@/lib/api/response";
import { log } from "@/lib/logger";
import { registerPdfFonts } from "@/lib/pdf/fonts";
import { qrDataUrl } from "@/lib/pdf/qr";
import { getOrRender, lrPdfPath } from "@/lib/pdf/cache";
import { LrDocument } from "@/lib/pdf/LrDocument";
import { loadLrPdfData } from "@/lib/pdf/lr-data";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const maxDuration = 30;

registerPdfFonts();

// A shipment can sit in transit for days, and the office may want to
// re-share the same link if the first message gets lost — this is
// deliberately generous, not a security-sensitive expiry.
const EXPIRY_SECONDS = 7 * 24 * 60 * 60;

/**
 * A URL an office user can hand to someone with NO LogiFlow account at all —
 * the consignor's staff at the pickup point, who need to print the LR before
 * the truck arrives to load, and have never signed in and never will.
 *
 * The LR PDF route itself (`lr.pdf/route.tsx`) requires a real session —
 * correctly so, since it re-renders on every request through the caller's
 * own RLS-scoped read. Sending that URL to an external phone would just
 * produce a 401. Instead of opening a fifth anon-reachable surface (the
 * thing CLAUDE.md's directive #3 exists to make a deliberate decision about,
 * not a default), this reuses a use of the service role already sanctioned
 * for exactly this: signing a URL to an object in the PDF cache, AFTER the
 * caller's own session has already been authorised to read that consignment.
 * The signed URL needs no login and expires on its own — no new function,
 * no new grant, no anon-callable RPC.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const auth = await verifyAuth();
  if (!auth.ok) return apiErr(auth.error, auth.status);

  const supabase = await createClient();

  // Session-scoped: RLS is still the tenancy check, exactly like the PDF
  // route itself. A cross-org id yields no row here, same 404 either way.
  const loaded = await loadLrPdfData(supabase, id);
  if (!loaded) return apiErr("Not found", 404);
  const { lr, orgId, docVersion, trackingToken } = loaded;

  try {
    const qr = await qrDataUrl(`${env.appUrl}/track/${trackingToken}`);
    const path = lrPdfPath(orgId, id, docVersion, "a4", "all");
    await getOrRender(path, () => <LrDocument lr={lr} qr={qr} size="a4" copies="all" />);

    // Only now, after the render/cache step has confirmed the object exists
    // (or already did), does this reach for the service role — signing a URL
    // to a row this session has already been authorised to read.
    const admin = createAdminClient();
    const { data: signed, error } = await admin.storage
      .from("docs")
      .createSignedUrl(path, EXPIRY_SECONDS);

    if (error || !signed) {
      log.error("LR share-link signing failed", { id, err: error?.message });
      return apiErr("Could not create a shareable link", 500);
    }

    return apiOk({ url: signed.signedUrl });
  } catch (err) {
    log.error("LR share-link render failed", { id, err: String(err) });
    return apiErr("Could not generate the lorry receipt", 500);
  }
}
