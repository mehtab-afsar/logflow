import { Reveal } from "@/features/marketing/components/Reveal";

/**
 * Three columns divided by hairlines — the three documents that move money.
 * No cards and no icons: an ink rule over each column and a hairline between
 * them is the only structure needed, and it keeps the section reading as a
 * printed page rather than three tiles. The bullet marker is a short blue dash
 * rather than a dot, because it is the same rule stock as everything else on
 * the page shrunk to eight pixels.
 */
const PILLARS = [
  {
    title: "Digital lorry receipt",
    lead: "The same fields as your book, in the same order.",
    points: [
      "Numbered gapless per branch and financial year — never reused, even when one is cancelled.",
      "Tax mode set once. On reverse charge the LR prints the statutory note and no GST line at all.",
      "Four copies — consignor, consignee, driver, office — from one print.",
      "Party, vehicle and driver autocomplete from your own lists.",
    ],
  },
  {
    title: "Driver link, no app",
    lead: "One WhatsApp link per trip. Nothing to install, nothing to log into.",
    points: [
      "Four buttons: loaded, departed, reached, unloaded. In Hindi, Kannada or English.",
      "POD photo is compressed on the phone and queued — it sends itself when the signal returns.",
      "Diesel and toll go in with a photo of the bill, against the trip.",
      "The link expires once delivery is confirmed.",
    ],
  },
  {
    title: "Same-day freight bill",
    lead: "The POD lands in the office the moment it is signed, so the bill goes out the same day.",
    points: [
      "Bill one LR or batch a month of them for a regular customer.",
      "Trip settlement nets advance, diesel and toll against the driver's account.",
      "Export a Tally-importable CSV instead of retyping into the accounts system.",
      "Outstanding by customer and by age, on one screen.",
    ],
  },
] as const;

export function HowItWorks() {
  return (
    <section id="how" className="border-t border-line bg-paper">
      <div className="mx-auto max-w-[1120px] px-7 py-[104px]">
        <Reveal>
          <h2 className="max-w-[24ch] text-[clamp(30px,3.6vw,44px)] leading-[1.08] font-medium tracking-[-0.03em] text-ink">
            Three documents that move money, done properly.
          </h2>
        </Reveal>
        <Reveal delay={100}>
          <p className="mt-4 max-w-[52ch] text-[18px] leading-[1.5] text-ink-2">
            Not an ERP, not accounting. The lorry receipt, the proof of delivery and the freight
            bill — and the trip that connects them.
          </p>
        </Reveal>

        <div className="mt-14 grid gap-10 min-[860px]:grid-cols-3 min-[860px]:gap-0">
          {PILLARS.map((p, i) => (
            <div
              key={p.title}
              className={
                i === 0
                  ? "border-t border-ink pt-5 min-[860px]:pr-8"
                  : "border-t border-ink pt-5 min-[860px]:border-l min-[860px]:border-l-line min-[860px]:px-8 last:min-[860px]:pr-0"
              }
            >
              <Reveal delay={i * 100}>
                <h3 className="text-[21px] font-medium tracking-[-0.015em] text-ink">{p.title}</h3>
                <p className="mt-2 text-[16px] leading-[1.55] text-ink-2">{p.lead}</p>
                <ul className="mt-5 grid gap-3">
                  {p.points.map((point) => (
                    <li key={point} className="flex gap-2.5 text-[15px] leading-[1.55] text-ink-2">
                      <span className="mt-[11px] h-px w-2 shrink-0 bg-indigo-ink" aria-hidden />
                      {point}
                    </li>
                  ))}
                </ul>
              </Reveal>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
