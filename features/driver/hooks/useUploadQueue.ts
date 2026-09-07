"use client";

import { useCallback, useEffect, useState } from "react";
import { enqueue, pendingCount, failedCount, retryAllFailed, type Job } from "../utils/queue-db";
import { drain } from "../utils/queue-drain";

export interface QueueState {
  pending: number;
  failed: number;
  online: boolean;
  linkDead: boolean;
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
  });

  const refresh = useCallback(async () => {
    const [pending, failed] = await Promise.all([pendingCount(), failedCount()]);
    setState((s) => ({ ...s, pending, failed, online: navigator.onLine }));
  }, []);

  const run = useCallback(async () => {
    const result = await drain();
    setState((s) => ({ ...s, linkDead: s.linkDead || result.linkDead }));
    await refresh();
  }, [refresh]);

  const add = useCallback(
    async (job: Omit<Job, "seq" | "createdAt" | "attempts" | "nextAttemptAt" | "status">) => {
      await enqueue(job);
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
