import { cn } from "@/lib/utils";
import { STATUS_TOKENS } from "@/lib/design/tokens";
import type { Status } from "@/lib/consignments/state-machine";

/**
 * Status is always colour AND label. Never colour alone — a red dot means
 * nothing on a photocopied LR or to a colourblind dispatcher.
 */
export function StatusPill({ status, className }: { status: Status; className?: string }) {
  const token = STATUS_TOKENS[status];
  return (
    <span
      title={token.hint}
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        token.className,
        className,
      )}
    >
      {token.label}
    </span>
  );
}
