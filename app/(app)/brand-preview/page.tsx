import { Mark, type MarkVariant } from "@/components/brand/Mark";
import { Wordmark } from "@/components/brand/Wordmark";

/**
 * Temporary: a comparison sheet for choosing the mark. Deleted once one wins.
 */
export const dynamic = "force-dynamic";

const VARIANTS: { key: MarkVariant; name: string; idea: string }[] = [
  { key: "stamp", name: "Stamped receipt", idea: "A document struck solid across its lower third, the way a received stamp lands on a delivered LR." },
  { key: "fold", name: "Folded waybill", idea: "The turned corner of a carbon copy — the fold is what stays recognisable when the detail drops out." },
  { key: "road", name: "Road through document", idea: "The consignment moving. The diagonal is the only part that has to read small, and it does." },
];

const SIZES = [16, 24, 48, 96];

export default function BrandPreviewPage() {
  return (
    <div className="space-y-10 p-10">
      <header>
        <h1 className="text-xl font-semibold">Choose the mark</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-2">
          Each is one colour on a 24px grid, so it sits beside the lucide icons already in the
          product. None is a truck — the truck is the Fleet nav item, and a logo that is also a
          menu entry is why the current one reads as a placeholder.
        </p>
      </header>

      {VARIANTS.map((v) => (
        <section key={v.key} className="space-y-4 rounded-[10px] border bg-white p-6">
          <div>
            <h2 className="font-medium">{v.name}</h2>
            <p className="mt-0.5 max-w-2xl text-sm text-ink-2">{v.idea}</p>
          </div>

          {/* On paper, at the sizes it actually has to survive */}
          <div className="flex items-end gap-8 rounded-md bg-paper p-6">
            {SIZES.map((s) => (
              <div key={s} className="flex flex-col items-center gap-2">
                <Mark variant={v.key} style={{ width: s, height: s }} className="text-ink" />
                <span className="font-mono text-[11px] text-ink-3">{s}px</span>
              </div>
            ))}
          </div>

          {/* Reversed out of the rail colour, which is where it lives most */}
          <div className="flex items-end gap-8 rounded-md bg-indigo-ink p-6">
            {SIZES.map((s) => (
              <div key={s} className="flex flex-col items-center gap-2">
                <Mark variant={v.key} style={{ width: s, height: s }} className="text-white" />
                <span className="font-mono text-[11px] text-white/50">{s}px</span>
              </div>
            ))}
          </div>

          {/* The lock-up, as it appears in chrome and on paper */}
          <div className="flex flex-wrap items-center gap-8 rounded-md border border-line-soft p-6">
            <Wordmark variant={v.key} size="sm" />
            <Wordmark variant={v.key} size="md" />
            <Wordmark variant={v.key} size="lg" />
            <span className="h-8 w-px bg-line" />
            <Wordmark variant={v.key} size="md" tile={false} />
            <span className="font-mono text-[11px] text-ink-3">bare, for paper and print</span>
          </div>
        </section>
      ))}
    </div>
  );
}
