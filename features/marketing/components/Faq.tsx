"use client";

import { ChevronDown } from "lucide-react";
import { Reveal } from "@/features/marketing/components/Reveal";

/**
 * A ledger, not an accordion widget: a mono index number where a line item
 * would carry one, then the question, then the answer under it when opened.
 * `<details>` rather than a custom disclosure component — the browser's own
 * open/close state, keyboard handling and no-JS fallback for free.
 */
const FAQ = [
  {
    q: "Do drivers need to install anything?",
    a: "No. One WhatsApp link per trip, four buttons — loaded, departed, reached, unloaded — in Hindi, Kannada or English. Nothing to install, nothing to log into.",
  },
  {
    q: "What happens to the paper LR book?",
    a: "You keep printing it. LogiFlow drives the same book — numbered gapless per branch and financial year — so the printed copy in the driver's hand and the digital one in your account are the same document, not two records that can drift apart.",
  },
  {
    q: "How is GST handled on the LR?",
    a: "Server-side, from the tax mode you set once: reverse charge, 5% without input credit, or 18% with it. On reverse charge the LR prints the statutory note and no GST line at all — never a figure a browser guessed at.",
  },
  {
    q: "Can I try it before switching my whole fleet?",
    a: "Yes. The 30-day pilot runs on one branch with unlimited lorry receipts, alongside whatever you use today, so nothing has to move until you've seen it against your own paper.",
  },
  {
    q: "Is my data separated from other transporters on LogiFlow?",
    a: "Yes — at the database level, via row-level security, not an application-side check. One organisation's rows are structurally unreachable from another's session.",
  },
  {
    q: "What does the pilot cost?",
    a: "Nothing for the first 30 days. After that, from ₹3,000 per month per branch — no per-LR charges, no setup fee.",
  },
] as const;

export function Faq() {
  return (
    <section id="faq" className="border-t border-line bg-paper">
      <div className="mx-auto max-w-[1120px] px-7 py-[104px]">
        <Reveal>
          <h2 className="text-[clamp(30px,3.6vw,44px)] leading-[1.08] font-medium tracking-[-0.03em] text-ink">
            Questions, answered.
          </h2>
        </Reveal>
        <Reveal delay={100}>
          <p className="mt-4 max-w-[52ch] text-[18px] leading-[1.5] text-ink-2">
            The rest, on a 20-minute call — book one below.
          </p>
        </Reveal>

        <div className="mt-14 max-w-[760px] border-t border-ink">
          {FAQ.map((item, i) => (
            <Reveal key={item.q} delay={i * 50}>
              <details className="group border-b border-line py-6">
                <summary className="flex cursor-pointer list-none items-start gap-5 [&::-webkit-details-marker]:hidden">
                  <span className="font-mono pt-0.5 text-[13px] text-ink-3">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="flex-1 text-[17px] font-medium tracking-[-0.01em] text-ink">
                    {item.q}
                  </span>
                  <ChevronDown
                    className="mt-1 size-4 shrink-0 text-ink-3 transition-transform duration-150 group-open:rotate-180"
                    strokeWidth={2}
                  />
                </summary>
                <p className="mt-3 max-w-[62ch] pl-[calc(2ch+1.25rem)] text-[15px] leading-[1.6] text-ink-2">
                  {item.a}
                </p>
              </details>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
