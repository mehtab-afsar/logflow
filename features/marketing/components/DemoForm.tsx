"use client";

import { useState } from "react";
import { Check } from "lucide-react";

const FLEET_SIZES = ["5–10 trucks", "11–25 trucks", "26–60 trucks", "More than 60"] as const;

/**
 * Booking a call, not creating an account: five fields, all of which an owner
 * can answer from memory while standing in the yard.
 *
 * The submit is deliberately local. Before a demo this must be pointed at a
 * real endpoint or a WhatsApp deep link (§8 of the design doc) — until then it
 * should never imply a message was actually sent to anyone.
 */
export function DemoForm() {
  const [sent, setSent] = useState(false);

  return (
    <section id="demo" className="border-t border-line bg-white">
      <div className="mx-auto grid max-w-[1120px] gap-10 px-7 py-[72px] min-[820px]:grid-cols-2">
        <div>
          <h2 className="max-w-[18ch] text-[28px] font-semibold tracking-[-0.01em] text-ink">
            See it with your own LR.
          </h2>
          <p className="mt-3 max-w-[52ch] text-[15px] leading-[1.55] text-ink-2">
            Bring one paper LR to the call. We enter it live, print the four copies, and send you
            the tracking link on WhatsApp. Twenty minutes, no slides.
          </p>

          <dl className="mt-8 space-y-4">
            <Offer term="Pilot" detail="30 days free, one branch, unlimited lorry receipts." />
            <Offer term="After the pilot" detail="From ₹3,000 per month per branch. No per-LR charges." />
            <Offer term="Setup" detail="We import your parties, trucks and drivers, and match your LR format." />
          </dl>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSent(true);
          }}
          className="rounded-[10px] border border-line bg-white p-6"
        >
          <div className="space-y-4">
            <Field id="name" label="Your name" autoComplete="name" required />
            <Field id="company" label="Company" autoComplete="organization" required />

            <div>
              <label htmlFor="trucks" className="block text-[13px] font-medium text-ink">
                Trucks you run
              </label>
              <select
                id="trucks"
                name="trucks"
                defaultValue={FLEET_SIZES[0]}
                className="mt-1.5 w-full rounded-md border border-line bg-white px-3 py-2.5 text-[14px] text-ink focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-indigo-ink"
              >
                {FLEET_SIZES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </div>

            <Field
              id="phone"
              label="WhatsApp number"
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              placeholder="98765 43210"
              mono
              required
            />
            <Field id="lanes" label="Your main lanes" placeholder="Bengaluru – Chennai, Bengaluru – Hyderabad" />
          </div>

          <button
            type="submit"
            disabled={sent}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-md bg-indigo-ink px-4 py-3 text-[14px] font-medium text-white transition-colors duration-150 hover:bg-indigo-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-ink disabled:bg-forest"
          >
            {sent ? (
              <>
                <Check className="size-4" strokeWidth={2.5} aria-hidden />
                Request sent
              </>
            ) : (
              "Book my demo"
            )}
          </button>

          <p aria-live="polite" className="mt-3 text-[12.5px] text-ink-3">
            {sent
              ? "We reply on WhatsApp within a working day."
              : "We reply on WhatsApp within a working day. No calls from a call centre."}
          </p>
        </form>
      </div>
    </section>
  );
}

function Offer({ term, detail }: { term: string; detail: string }) {
  return (
    <div className="border-t border-line-soft pt-3">
      <dt className="text-[13px] font-medium text-ink">{term}</dt>
      <dd className="mt-0.5 text-[13.5px] leading-[1.5] text-ink-2">{detail}</dd>
    </div>
  );
}

function Field({
  id,
  label,
  mono,
  ...props
}: { id: string; label: string; mono?: boolean } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label htmlFor={id} className="block text-[13px] font-medium text-ink">
        {label}
      </label>
      <input
        id={id}
        name={id}
        {...props}
        className={`mt-1.5 w-full rounded-md border border-line bg-white px-3 py-2.5 text-[14px] text-ink placeholder:text-ink-3 focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-indigo-ink ${
          mono ? "font-mono" : ""
        }`}
      />
    </div>
  );
}
