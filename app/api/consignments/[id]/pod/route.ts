import { type NextRequest } from "next/server";
import { verifyAuth } from "@/lib/auth/verify";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiErr, apiOk } from "@/lib/api/response";
import { apiErrFromRpc } from "@/lib/api/rpc-error";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const maxDuration = 30;

// More generous than the driver route's 800KB: the driver's phone compresses
// before upload, but a photo of a paper form taken by whoever is handling it
// office-side (or a scan) may not be pre-compressed at all.
const MAX_BYTES = 5_000_000;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A POD the office is attaching on the driver's behalf — the physical,
 * signed paper eventually reached them some other way (posted, photographed
 * by whoever was at the delivery point, brought back with the truck) and
 * someone at the office is scanning or photographing it in.
 *
 * The storage upload is the one place this uses the service role — same
 * sanctioned use as the driver route (CLAUDE.md directive #1) — but the RPC
 * call after it runs on the caller's OWN session, not admin:
 * current_org_id()/has_role() inside record_pod_for_office() need a real
 * JWT, which the admin client does not carry.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const auth = await verifyAuth();
  if (!auth.ok) return apiErr(auth.error, auth.status);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return apiErr("Could not read the upload", 400);
  }

  const file = form.get("file");
  const clientId = String(form.get("client_id") ?? "");
  const pageNo = Number(form.get("page_no") ?? 1);

  if (typeof file === "string" || file === null) return apiErr("No file was attached", 422);
  if (!UUID.test(clientId)) return apiErr("Invalid client_id", 422);
  if (!Number.isInteger(pageNo) || pageNo < 1 || pageNo > 10) {
    return apiErr("page_no must be between 1 and 10", 422);
  }
  if (file.size > MAX_BYTES) return apiErr("That file is too large.", 413);
  const contentType = file.type || "image/jpeg";
  if (!ALLOWED.has(contentType)) return apiErr("Only a photo or PDF can be uploaded", 415);

  const ext = contentType === "application/pdf" ? "pdf" : "jpg";
  const path = `${auth.ctx.orgId}/${id}/${clientId}.${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());

  const admin = createAdminClient();
  const { error: uploadError } = await admin.storage
    .from("pods")
    .upload(path, bytes, { contentType, upsert: true });

  if (uploadError) {
    log.error("Office POD upload failed", { err: uploadError.message });
    return apiErr("Could not save the file. Please try again.", 500);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("record_pod_for_office", {
    p_consignment_id: id,
    p_path: path,
    p_client_id: clientId,
    p_page_no: pageNo,
  });

  if (error) return apiErrFromRpc("record_pod_for_office failed", error);
  return apiOk({ ...(data as object), path });
}
