import {
  type Job, dueJobs, updateJob, removeJob, backoffMs, MAX_ATTEMPTS,
} from "./queue-db";

/**
 * Drains the upload queue.
 *
 * ORDERING: strictly serial by seq, because milestones are causally ordered —
 * "unloaded" must never land before "reached". If a MILESTONE fails we stop the
 * whole pass rather than skipping ahead; PODs and expenses are commutative so a
 * failure there only defers itself.
 *
 * STATUS HANDLING:
 *   2xx or 409  → done. 409 means the server already has it (the unique index
 *                 on (consignment_id, client_id) fired), which is success from
 *                 the phone's point of view.
 *   401 / 410   → the link is dead. Stop and surface it; retrying cannot help.
 *   other 4xx   → permanent. Never retried — a malformed payload will stay
 *                 malformed and would otherwise spin for eight attempts.
 *   5xx/network → transient. Back off and retry.
 */

let draining = false;

export interface DrainResult {
  sent: number;
  failed: number;
  linkDead: boolean;
}

export async function drain(fetchImpl: typeof fetch = fetch): Promise<DrainResult> {
  if (draining) return { sent: 0, failed: 0, linkDead: false };
  draining = true;
  try {
    // Cross-tab safety: two tabs of the same portal must not both drain.
    if (typeof navigator !== "undefined" && navigator.locks?.request) {
      return await navigator.locks.request("logiflow-queue", () => drainOnce(fetchImpl));
    }
    return await drainOnce(fetchImpl);
  } finally {
    draining = false;
  }
}

async function drainOnce(fetchImpl: typeof fetch): Promise<DrainResult> {
  const result: DrainResult = { sent: 0, failed: 0, linkDead: false };
  const jobs = await dueJobs();

  for (const job of jobs) {
    if (typeof navigator !== "undefined" && navigator.onLine === false) break;

    await updateJob(job.id, { status: "inflight" });

    try {
      const res = await send(job, fetchImpl);

      if (res.ok || res.status === 409) {
        await removeJob(job.id);
        result.sent += 1;
        continue;
      }

      if (res.status === 401 || res.status === 410) {
        await updateJob(job.id, { status: "failed", lastError: "This link has expired." });
        result.failed += 1;
        result.linkDead = true;
        break;
      }

      if (res.status >= 400 && res.status < 500) {
        const body = await res.json().catch(() => ({ error: `Rejected (${res.status})` }));
        await updateJob(job.id, { status: "failed", lastError: body.error ?? "Rejected" });
        result.failed += 1;
        continue;
      }

      throw new Error(`server error ${res.status}`);
    } catch (err) {
      const attempts = job.attempts + 1;
      if (attempts >= MAX_ATTEMPTS) {
        await updateJob(job.id, {
          status: "failed",
          attempts,
          lastError: "Could not send after several tries. Tap Retry when you have signal.",
        });
        result.failed += 1;
      } else {
        await updateJob(job.id, {
          status: "pending",
          attempts,
          nextAttemptAt: Date.now() + backoffMs(attempts),
          lastError: String(err instanceof Error ? err.message : err),
        });
      }
      // Milestones are causally ordered: do not let a later one overtake.
      if (job.kind === "milestone") break;
    }
  }

  return result;
}

function send(job: Job, fetchImpl: typeof fetch): Promise<Response> {
  const signal =
    typeof AbortSignal !== "undefined" && "timeout" in AbortSignal
      ? AbortSignal.timeout(30_000)
      : undefined;

  if (job.kind === "pod" && job.blob) {
    const form = new FormData();
    form.append("file", job.blob, `${job.id}.jpg`);
    form.append("client_id", job.id);
    form.append("page_no", String(job.payload.page_no ?? 1));
    return fetchImpl(`/api/d/${job.token}/pod`, { method: "POST", body: form, signal });
  }

  const path = job.kind === "milestone" ? "milestone" : "expense";
  return fetchImpl(`/api/d/${job.token}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...job.payload, client_id: job.id }),
    signal,
  });
}
