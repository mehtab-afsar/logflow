"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const FLEET_SIZES = ["5–10", "11–25", "26–60", "More than 60"] as const;

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
    <section id="demo" className="border-t border-line bg-paper">
      <div className="mx-auto grid max-w-[1120px] gap-14 px-7 py-[104px] min-[860px]:grid-cols-2">
        <div>
          <h2 className="max-w-[18ch] text-[clamp(30px,3.6vw,44px)] leading-[1.08] font-medium tracking-[-0.03em] text-ink">
            See it with your own LR.
          </h2>
          <p className="mt-4 max-w-[52ch] text-[18px] leading-[1.5] text-ink-2">
            Bring one paper LR to the call. We enter it live, print the four copies, and send you
            the tracking link on WhatsApp. Twenty minutes, no slides.
          </p>

          <dl className="mt-10 border-t border-ink">
            <Row term="Pilot" detail="30 days free, one branch, unlimited lorry receipts." />
            <Row term="After the pilot" detail="From ₹3,000 per month per branch. No per-LR charges." />
            <Row term="Setup" detail="We import your parties, trucks and drivers, and match your LR format." />
          </dl>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSent(true);
          }}
          className="rounded-[12px] border border-line bg-white p-7"
        >
          <div className="grid gap-4">
            <Field id="name" label="Your name" autoComplete="name" required />
            <Field id="company" label="Company" autoComplete="organization" required />

            <fieldset>
              <legend className="text-[14px] font-medium text-ink">Trucks you run</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {FLEET_SIZES.map((s, i) => (
                  <label key={s} className="cursor-pointer">
                    <input
                      type="radio"
                      name="trucks"
                      value={s}
                      defaultChecked={i === 0}
                      className="peer sr-only"
                    />
                    <span
                      className={cn(
                        "block rounded-full border border-line px-3.5 py-2 text-[14px] text-ink-2 transition-colors duration-150",
                        "peer-checked:border-ink peer-checked:bg-ink peer-checked:text-white",
                        "peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-[3px] peer-focus-visible:outline-indigo-ink",
                      )}
                    >
                      {s}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <Field
              id="phone"
              label="WhatsApp number"
              type="tel"
              inputMode="tel"
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
            className="mt-7 flex w-full items-center justify-center gap-2 rounded-[8px] bg-ink px-6 py-[15px] text-[16px] font-medium text-white transition-colors duration-150 hover:bg-ink-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-indigo-ink disabled:bg-ink-2"
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

          <p aria-live="polite" className="mt-3 text-center text-[14px] text-ink-3">
            {sent
              ? "We reply on WhatsApp within a working day."
              : "We reply on WhatsApp within a working day. No calls from a call centre."}
          </p>
        </form>
      </div>
    </section>
  );
}

function Row({ term, detail }: { term: string; detail: string }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-5 border-b border-line py-4 text-[15px]">
      <dt className="text-ink-3">{term}</dt>
      <dd className="text-ink-2">{detail}</dd>
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
      <label htmlFor={id} className="block text-[14px] font-medium text-ink">
        {label}
      </label>
      <input
        id={id}
        name={id}
        {...props}
        className={cn(
          "mt-1.5 w-full rounded-[8px] border border-line bg-white px-3.5 py-3 text-[16px] text-ink placeholder:text-ink-3",
          "focus:border-indigo-ink focus:shadow-[0_0_0_3px_var(--color-indigo-tint)] focus:outline-none",
          mono && "font-mono",
        )}
      />
    </div>
  );
}
