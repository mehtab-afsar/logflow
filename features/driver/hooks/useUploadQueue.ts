"use client";

import { useCallback, useEffect, useState } from "react";
import { enqueue, pendingCount, failedCount, retryAllFailed, type Job } from "../utils/queue-db";
import { drain } from "../utils/queue-drain";

export interface QueueState {
  pending: number;
  failed: number;
  online: boolean;
  linkDead: boolean;
  /** IndexedDB itself is unavailable or refused to open — Safari Private
   *  Browsing is the common real case. Distinct from `failed`: a failed job
   *  is one the server rejected after being safely queued; this is a tap that
   *  never got as far as being queued at all, which every prior version of
   *  this hook let disappear in total silence. See add() below. */
  dbError: boolean;
}

/**
 * Owns the queue lifecycle for the driver portal.
 *
 * The visibilitychange listener is the important one: Android Chrome discards
 * timers when the driver switches to WhatsApp, and the `online` event often
 * never fires because the tab was frozen rather than actually offline. Without
 * it, a queued POD can sit unsent until the driver happens to tap something.
 */
export function useUploadQueue() {
  const [state, setState] = useState<QueueState>({
    pending: 0,
    failed: 0,
    online: true,
    linkDead: false,
    dbError: false,
  });

  const refresh = useCallback(async () => {
    try {
      const [pending, failed] = await Promise.all([pendingCount(), failedCount()]);
      // A successful read is proof storage is working again — clears an
      // error left over from an earlier attempt (Private Browsing turned
      // off, the phone rebooted, whatever it was).
      setState((s) => ({ ...s, pending, failed, online: navigator.onLine, dbError: false }));
    } catch {
      // Same storage failure as add() below, reached from the polling paths
      // (mount, online, visibilitychange) rather than a tap. Same signal.
      setState((s) => ({ ...s, dbError: true }));
    }
  }, []);

  const run = useCallback(async () => {
    try {
      const result = await drain();
      setState((s) => ({ ...s, linkDead: s.linkDead || result.linkDead }));
    } catch {
      setState((s) => ({ ...s, dbError: true }));
    }
    // Always, even after a throw above — refresh has its own try/catch and
    // is what keeps `pending`/`failed` honest no matter what drain() did.
    await refresh();
  }, [refresh]);

  const add = useCallback(
    async (job: Omit<Job, "seq" | "createdAt" | "attempts" | "nextAttemptAt" | "status">) => {
      // NOT caught here: the caller (recordMilestone, onPhoto, the expense
      // form) must know the tap failed to queue at all, so it can skip the
      // optimistic "done" update rather than showing a checkmark for
      // something that was never saved anywhere, on-device or off.
      try {
        await enqueue(job);
      } catch (err) {
        setState((s) => ({ ...s, dbError: true }));
        throw err;
      }
      await refresh();
      void run();
    },
    [refresh, run],
  );

  const retry = useCallback(async () => {
    await retryAllFailed();
    setState((s) => ({ ...s, linkDead: false }));
    await run();
  }, [run]);

  useEffect(() => {
    // Deferred to a macrotask: draining touches IndexedDB and then setState,
    // and doing that synchronously inside the mount effect causes cascading
    // renders (and is flagged by react-hooks/set-state-in-effect).
    const kickoff = setTimeout(() => {
      void run();
    }, 0);

    const onOnline = () => {
      setState((s) => ({ ...s, online: true }));
      void run();
    };
    const onOffline = () => setState((s) => ({ ...s, online: false }));
    const onVisible = () => {
      if (document.visibilityState === "visible") void run();
    };

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisible);

    // Backstop for the case where no event fires at all.
    const timer = setInterval(() => {
      void run();
    }, 15_000);

    return () => {
      clearTimeout(kickoff);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(timer);
    };
  }, [run]);

  return { ...state, add, retry, refresh };
}
