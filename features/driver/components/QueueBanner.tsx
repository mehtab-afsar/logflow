"use client";

import { CloudOff, Loader2, AlertTriangle } from "lucide-react";
import type { QueueState } from "../hooks/useUploadQueue";
import type { TranslationKey } from "../hooks/useI18n";

/**
 * The only thing that tells a driver his work is safe. Not optional: without
 * it, a driver who photographs a POD with no signal has no reason to believe
 * anything happened, and will either retake it repeatedly or give up.
 */
export function QueueBanner({
  state,
  onRetry,
  t,
}: {
  state: QueueState;
  onRetry: () => void;
  t: (k: TranslationKey) => string;
}) {
  if (state.failed === 0 && state.pending === 0) return null;

  if (state.failed > 0) {
    return (
      <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-marigold/35 bg-marigold-tint px-4 py-3 text-sm text-marigold-ink">
        <span className="flex items-center gap-2">
          <AlertTriangle className="size-4 shrink-0" strokeWidth={1.5} />
          {state.failed} {t("failed")}
        </span>
        <button
          onClick={onRetry}
          className="rounded-md bg-marigold-ink px-3 py-1.5 text-xs font-medium text-white"
        >
          {t("retry")}
        </button>
      </div>
    );
  }

  return (
    <div className="sticky bottom-0 flex items-center gap-2 border-t bg-line-soft px-4 py-3 text-sm text-ink-2">
      {state.online ? (
        <Loader2 className="size-4 animate-spin" strokeWidth={1.5} />
      ) : (
        <CloudOff className="size-4" strokeWidth={1.5} />
      )}
      <span>
        {state.pending} {state.online ? t("sending") : t("offline")}
      </span>
    </div>
  );
}
