/**
 * Six things that are true of Indian transport and of no other market. Written
 * as a definition list because that is what it is: a term and one sentence.
 */
const ROWS = [
  {
    term: "GST on your LR",
    body: "Reverse charge, 5% without input credit or 18% with it — set once, printed correctly on every LR after that.",
  },
  {
    term: "E-way bill",
    body: "The number sits on the slip the driver hands over at the checkpost, and the expiry is tracked against the trip.",
  },
  {
    term: "Driver phones",
    body: "A WhatsApp link on a ₹6,000 Android, in Hindi or Kannada, with buttons big enough for a hand in the sun.",
  },
  {
    term: "Truck papers",
    body: "Insurance, fitness, permit and PUC expiry per vehicle, flagged 30 days before they lapse.",
  },
  {
    term: "Indian formats",
    body: "₹12,34,567.89 grouping, DD-MM-YYYY dates, KA 51 AB 4471 registrations, financial years that start in April.",
  },
  {
    term: "Attached trucks",
    body: "Own and attached vehicles on one register, with the attached lorry's owner and hire settled per trip.",
  },
] as const;

export function BuiltForIndia() {
  return (
    <section id="india" className="border-t border-line">
      <div className="mx-auto max-w-[1120px] px-7 py-[72px]">
        <h2 className="text-[28px] font-semibold tracking-[-0.01em] text-ink">Built for India</h2>
        <p className="mt-3 max-w-[62ch] text-[15px] leading-[1.55] text-ink-2">
          Not a global fleet product with a rupee symbol added.
        </p>

        <dl className="mt-10 grid gap-x-12 min-[820px]:grid-cols-2">
          {ROWS.map((r) => (
            <div key={r.term} className="border-t border-line-soft py-5">
              <dt className="text-[15px] font-medium text-ink">{r.term}</dt>
              <dd className="mt-1.5 max-w-[52ch] text-[13.5px] leading-[1.55] text-ink-2">{r.body}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
