"use client";

import { useLiveBoard } from "../hooks/useLiveBoard";

/**
 * Shows that the board is listening, and pulses when something arrives.
 *
 * Worth the pixels: without it, a board that updates on its own looks like a
 * page that refreshed for no reason. With it, the dispatcher knows the change
 * came from the driver.
 *
 * The pulse is driven by remounting the ping element with a key rather than by
 * a second piece of state and a timer — the animation replays because the node
 * is new, which is both simpler and avoids a synchronous setState in an effect.
 */
export function LiveIndicator({ orgId }: { orgId: string }) {
  const { connected, lastEventAt, justUpdated } = useLiveBoard(orgId);

  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs text-ink-3"
      title={connected ? "Updating live as drivers report" : "Not connected — refresh to see changes"}
    >
      <span className="relative flex size-2">
        {connected && lastEventAt !== null && (
          <span
            key={lastEventAt}
            className="absolute inline-flex size-2 animate-ping rounded-full bg-forest opacity-75"
          />
        )}
        <span
          className={`relative inline-flex size-2 rounded-full transition-colors duration-150 ${
            connected ? "bg-forest" : "bg-line"
          }`}
        />
      </span>
      {connected ? (justUpdated ? "Updated just now" : "Live") : "Offline"}
    </span>
  );
}
