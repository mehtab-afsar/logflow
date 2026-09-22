import { ArrowRight } from "lucide-react";

/**
 * The page's one dark note, right before the footer — not a second CTA. The
 * form in DemoForm above is the actual conversion mechanism; repeating a big
 * headline-and-button block here (as Moonbook's closing panel does) would be
 * asking the same question twice. This is quieter: one line of reassurance
 * and a way back up to the form, on a dark ground so the page closes on
 * contrast rather than trailing off in white.
 */
export function SignatureStrip() {
  return (
    <section className="relative overflow-hidden bg-ink">
      <svg
        aria-hidden
        viewBox="0 0 800 120"
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-0 h-full w-full stroke-white opacity-[0.07]"
      >
        <path
          d="M-50 60C70 20 130 20 250 60S430 100 550 60S730 20 850 60"
          fill="none"
          strokeWidth={1.4}
          strokeLinecap="round"
        />
      </svg>
      <div className="relative mx-auto flex max-w-[1120px] flex-wrap items-center justify-between gap-4 px-7 py-8">
        <p className="text-[14px] text-white/70">
          No card required. No per-LR charges. Cancel anytime during the pilot.
        </p>
        <a
          href="#demo"
          className="group inline-flex items-center gap-1.5 text-[14px] font-medium text-white hover:text-white/80"
        >
          Book a 20-minute demo
          <ArrowRight className="size-3.5 transition-transform duration-150 group-hover:translate-x-0.5" strokeWidth={2} />
        </a>
      </div>
    </section>
  );
}
