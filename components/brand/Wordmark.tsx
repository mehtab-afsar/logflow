import { Mark } from "./Mark";
import { cn } from "@/lib/utils";

/**
 * Mark plus name, locked up at a fixed ratio so the pairing is consistent
 * wherever it appears. The mark sits in a filled tile in chrome, and bare on
 * paper surfaces where a filled box would fight the document.
 */
export function Wordmark({
  tile = true,
  size = "md",
  className,
}: {
  /** Filled indigo tile behind the mark. Off for paper and print. */
  tile?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const dims = {
    sm: { box: "size-6", icon: "size-3.5", text: "text-sm" },
    md: { box: "size-7", icon: "size-4", text: "text-[15px]" },
    lg: { box: "size-9", icon: "size-5", text: "text-lg" },
  }[size];

  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold text-ink", className)}>
      {tile ? (
        <span
          className={cn(
            "flex items-center justify-center rounded-md bg-indigo-ink text-white",
            dims.box,
          )}
        >
          <Mark className={dims.icon} />
        </span>
      ) : (
        <Mark className={cn(dims.icon, "text-indigo-ink")} />
      )}
      <span className={dims.text}>LogiFlow</span>
    </span>
  );
}
