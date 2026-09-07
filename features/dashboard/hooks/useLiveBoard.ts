"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Keeps the Today board live.
 *
 * When a driver taps a milestone on his phone, a row lands in
 * consignment_events and this refreshes the board — so the card moves from
 * In transit to Delivered on the dispatcher's screen with nobody touching it.
 *
 * Two deliberate choices:
 *
 *  · It refreshes rather than patching local state from the payload. The
 *    server component re-runs and RLS applies again, so the socket is only a
 *    signal that something changed, never a source of data. A mis-scoped
 *    payload therefore cannot put another organisation's trip on screen.
 *
 *  · Refreshes are coalesced. One transition writes one event, but a batch
 *    action (billing eight consignments) writes eight in the same instant;
 *    without the debounce that is eight server round-trips.
 */
export function useLiveBoard(orgId: string) {
  const router = useRouter();
  const [connected, setConnected] = useState(false);
  const [lastEventAt, setLastEventAt] = useState<number | null>(null);
  // Whether an event arrived recently enough to acknowledge on screen. Owned
  // here rather than derived from Date.now() during render, which would make
  // the component impure and its output depend on when React happened to draw.
  const [justUpdated, setJustUpdated] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`board:${orgId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "consignment_events" },
        () => {
          setLastEventAt(Date.now());
          setJustUpdated(true);

          if (flashTimer.current) clearTimeout(flashTimer.current);
          flashTimer.current = setTimeout(() => setJustUpdated(false), 2000);

          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => router.refresh(), 400);
        },
      )
      .subscribe((status) => {
        setConnected(status === "SUBSCRIBED");
      });

    return () => {
      if (timer.current) clearTimeout(timer.current);
      if (flashTimer.current) clearTimeout(flashTimer.current);
      void supabase.removeChannel(channel);
    };
  }, [orgId, router]);

  return { connected, lastEventAt, justUpdated };
}
