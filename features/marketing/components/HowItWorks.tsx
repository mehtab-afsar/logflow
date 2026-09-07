/**
 * Three columns divided by hairlines — the three documents that move money.
 * No cards and no icons: the rule between columns is the only structure needed.
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
    <section id="how" className="border-t border-line bg-white">
      <div className="mx-auto max-w-[1120px] px-7 py-[72px]">
        <h2 className="max-w-[24ch] text-[28px] font-semibold tracking-[-0.01em] text-ink">
          Three documents that move money, done properly.
        </h2>
        <p className="mt-3 max-w-[62ch] text-[15px] leading-[1.55] text-ink-2">
          Not an ERP, not accounting. The lorry receipt, the proof of delivery and the freight bill
          — and the trip that connects them.
        </p>

        <div className="mt-10 grid gap-8 min-[820px]:grid-cols-3 min-[820px]:gap-0">
          {PILLARS.map((p, i) => (
            <div
              key={p.title}
              className={
                i === 0
                  ? "min-[820px]:pr-8"
                  : "border-t border-line-soft pt-8 min-[820px]:border-t-0 min-[820px]:border-l min-[820px]:border-line-soft min-[820px]:px-8 min-[820px]:pt-0 last:min-[820px]:pr-0"
              }
            >
              <h3 className="text-[17px] font-semibold text-ink">{p.title}</h3>
              <p className="mt-2 text-[14px] leading-[1.55] text-ink-2">{p.lead}</p>
              <ul className="mt-4 space-y-2.5">
                {p.points.map((point) => (
                  <li key={point} className="flex gap-2.5 text-[13.5px] leading-[1.5] text-ink-2">
                    <span className="mt-[7px] size-1 shrink-0 rounded-full bg-ink-3" aria-hidden />
                    {point}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
