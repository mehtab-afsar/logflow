import { apiErr } from "@/lib/api/response";
import { log } from "@/lib/logger";

const KNOWN = ["42501", "23514", "P0002"];

/**
 * Maps a Postgres error raised by one of our SECURITY DEFINER RPCs to the
 * right HTTP status — 42501 forbidden, 23514 a rejected business rule or
 * precondition, P0002 not found (used instead of 403 for a cross-org row, so
 * a caller cannot tell the difference between "forbidden" and "does not
 * exist"). Anything else is a bug rather than a rejected rule, so it is
 * logged instead of shown verbatim.
 *
 * Same convention already used inline in the transition and bills routes;
 * shared here because this migration adds four more call sites for it.
 */
export function apiErrFromRpc(context: string, error: { code?: string; message: string }) {
  if (!KNOWN.includes(error.code ?? "")) {
    log.error(context, { err: error.message, code: error.code });
    return apiErr("Something went wrong", 500);
  }
  const status = error.code === "42501" ? 403 : error.code === "P0002" ? 404 : 409;
  return apiErr(error.message, status);
}
