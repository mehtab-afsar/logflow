import "server-only";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import type { ReactElement } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { log } from "@/lib/logger";

/**
 * Storage-backed PDF cache.
 *
 * The document version is part of the PATH, so invalidation is automatic: any
 * material edit bumps consignments.doc_version (trigger, migration 06), which
 * produces a new path and therefore a miss. There is no cache-busting logic to
 * get wrong, and superseded versions remain as a free audit trail of exactly
 * what was printed and when.
 */
export function lrPdfPath(orgId: string, id: string, version: number, size: string, copies: string) {
  return `${orgId}/lr/${id}/v${version}-${size}-${copies}.pdf`;
}

export function billPdfPath(orgId: string, id: string, version = 1) {
  return `${orgId}/bill/${id}/v${version}.pdf`;
}

export interface CachedPdf {
  buffer: Buffer;
  cached: boolean;
}

export async function getOrRender(path: string, render: () => ReactElement<DocumentProps>): Promise<CachedPdf> {
  const admin = createAdminClient();

  const { data: existing } = await admin.storage.from("docs").download(path);
  if (existing) {
    return { buffer: Buffer.from(await existing.arrayBuffer()), cached: true };
  }

  const buffer = await renderToBuffer(render());

  // upsert: two concurrent first-renders race harmlessly to the same bytes.
  const { error } = await admin.storage
    .from("docs")
    .upload(path, buffer, { contentType: "application/pdf", upsert: true });

  if (error) {
    // A failed cache write must not fail the download the user is waiting for.
    log.warn("PDF cache write failed", { path, err: error.message });
  }

  return { buffer, cached: false };
}
