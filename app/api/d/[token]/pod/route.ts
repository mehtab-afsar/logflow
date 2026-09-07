import { type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiErr, apiOk } from "@/lib/api/response";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_BYTES = 800_000;         // client compresses to ~500KB; headroom above
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POD upload.
 *
 * A Next route handler rather than a Supabase Edge Function: everything it
 * needs (typed admin client, token resolution, logging, the rate limiter in
 * middleware) already lives here, and a second Deno copy of the token-checking
 * logic would inevitably drift from resolve_trip_token().
 *
 * Idempotency is layered so a retried upload from the offline queue is a
 * no-op rather than a duplicate page:
 *   1. client_id is generated once on the phone and reused on every retry
 *   2. storage upload uses upsert — same path, same bytes
 *   3. the (consignment_id, client_id) unique index makes the row insert a
 *      no-op, and the RPC reports deduped
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createAdminClient();

  // Resolve the token first: never touch storage for an invalid link.
  const { data: resolved, error: resolveError } = await admin
    .rpc("resolve_trip_token", { p_token: token })
    .maybeSingle();

  if (resolveError) {
    log.error("POD token resolution failed", { err: resolveError.message });
    return apiErr("Could not verify this link", 500);
  }
  if (!resolved) return apiErr("This link has expired", 410);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return apiErr("Could not read the upload", 400);
  }

  const file = form.get("file");
  const clientId = String(form.get("client_id") ?? "");
  const pageNo = Number(form.get("page_no") ?? 1);

  // FormDataEntryValue is `File | string`; narrow before touching size/type.
  if (typeof file === "string" || file === null) {
    return apiErr("No photo was attached", 422);
  }
  if (!UUID.test(clientId)) return apiErr("Invalid client_id", 422);
  if (!Number.isInteger(pageNo) || pageNo < 1 || pageNo > 10) {
    return apiErr("page_no must be between 1 and 10", 422);
  }
  if (file.size > MAX_BYTES) {
    return apiErr("That photo is too large. Please retake it.", 413);
  }
  const contentType = file.type || "image/jpeg";
  if (!ALLOWED.has(contentType)) return apiErr("Only photos can be uploaded", 415);

  const path = `${resolved.org_id}/${resolved.consignment_id}/${clientId}.jpg`;
  const bytes = new Uint8Array(await file.arrayBuffer());

  const { error: uploadError } = await admin.storage
    .from("pods")
    .upload(path, bytes, { contentType, upsert: true });

  if (uploadError) {
    log.error("POD upload failed", { err: uploadError.message });
    return apiErr("Could not save the photo. It will be retried.", 500);
  }

  const { data, error } = await admin.rpc("driver_register_pod", {
    p_token: token,
    p_path: path,
    p_client_id: clientId,
    p_page_no: pageNo,
  });

  if (error) {
    if (error.code === "42501") return apiErr("This link has expired", 410);
    log.error("POD registration failed", { err: error.message });
    return apiErr("Could not record the photo", 500);
  }

  return apiOk({ ...(data as object), path });
}
