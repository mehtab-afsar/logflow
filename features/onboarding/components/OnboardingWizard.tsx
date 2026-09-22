"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { isValidGstin, stateCodeFromGstin, formatRegNumber, normaliseIndianPhone } from "@/lib/india/validators";
import { GST_STATE_OPTIONS, stateName } from "@/lib/india/states";
import { VEHICLE_TYPES } from "@/features/masters/schemas/masters";
import { EmailSignIn } from "@/features/onboarding/components/EmailSignIn";

/**
 * Six questions, one per screen, then a summary — plus a sign-in gate before
 * any of them, for whoever has no session yet.
 *
 * Every rule here exists because the person filling this in is an owner on a
 * phone between two calls: one question per screen, one primary button, a
 * one-line reason under each heading explaining why we are asking, and "Skip
 * for now" on anything that can be added from the app later.
 *
 * The summary screen used to be the end of the flow with nothing behind it.
 * It now IS the write: clicking "Finish setup" calls POST /api/organisations
 * (which runs the create_organisation() transaction), then adds any trucks,
 * drivers and team invites that were filled in. Only once that succeeds does
 * the screen below say "you're set up" — see finishSetup().
 */

const STEPS = [
  { id: "company", rail: "Company" },
  { id: "gst", rail: "GST on your LR" },
  { id: "format", rail: "LR format" },
  { id: "trucks", rail: "Trucks" },
  { id: "drivers", rail: "Drivers" },
  { id: "team", rail: "Team" },
] as const;

const GST_MODES = [
  {
    value: "rcm",
    label: "No, the customer pays under reverse charge",
    consequence: "Your LR prints the statutory RCM note and no GST line. This is most small fleets.",
  },
  {
    value: "fcm_5",
    label: "Yes, 5% without input credit",
    consequence: "5% is added on the LR. You cannot claim credit on diesel, tyres or spares.",
  },
  {
    value: "fcm_18",
    label: "Yes, 18% with input credit",
    consequence: "18% is added on the LR and you claim credit on your own purchases.",
  },
] as const;

const LANGUAGES = [
  { label: "Hindi", value: "hi" },
  { label: "Kannada", value: "kn" },
  { label: "English", value: "en" },
] as const;

const TEAM_ROLES = [
  { label: "Dispatcher", value: "dispatcher" },
  { label: "Accounts", value: "accounts" },
  { label: "Viewer", value: "viewer" },
] as const;

interface TruckRow { reg: string; type: string; ownership: "Own" | "Attached" }
interface DriverRow { name: string; phone: string; language: string }
interface TeamRow { email: string; role: string }

export function OnboardingWizard({
  fyCode,
  signedInEmail,
}: {
  fyCode: string;
  /** null before the email gate has been passed — see the render below. */
  signedInEmail: string | null;
}) {
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  // Found by reproducing a real report of "the trucks and drivers I added
  // did not show up": trucks/drivers/invites were sent with Promise.all and
  // fetch() resolves on ANY HTTP status, so a rejected write was silently
  // treated as success. Anything that does not save now ends up here and is
  // shown on the summary screen instead of vanishing.
  const [skipped, setSkipped] = useState<string[]>([]);
  const [savedCounts, setSavedCounts] = useState({ trucks: 0, drivers: 0 });

  const [company, setCompany] = useState({
    name: "", gstin: "", pan: "", stateCode: "", branch: "", city: "", address: "",
  });
  const [gstMode, setGstMode] = useState<string>("rcm");
  const [format, setFormat] = useState({
    prefix: "LF", invPrefix: "INV", start: "1", invStart: "0", clause: "Owner's risk",
  });
  const [trucks, setTrucks] = useState<TruckRow[]>([
    { reg: "", type: VEHICLE_TYPES[0], ownership: "Own" },
    { reg: "", type: VEHICLE_TYPES[0], ownership: "Own" },
  ]);
  const [drivers, setDrivers] = useState<DriverRow[]>([
    { name: "", phone: "", language: "hi" },
    { name: "", phone: "", language: "hi" },
  ]);
  const [team, setTeam] = useState<TeamRow[]>([{ email: "", role: "dispatcher" }]);

  const next = () => (step === STEPS.length - 1 ? finishSetup() : setStep(step + 1));
  const back = () => setStep(Math.max(0, step - 1));

  /* The database issues LR numbers; this only shows the shape they will take. */
  const nextLrNo = `${(format.prefix || "LF").toUpperCase()}-${fyCode}-${String(
    Math.max(1, Number(format.start) || 1),
  ).padStart(6, "0")}`;

  async function finishSetup() {
    setSubmitting(true);
    setSubmitError("");

    const res = await fetch("/api/organisations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        legal_name: company.name,
        gstin: isValidGstin(company.gstin) ? company.gstin : "",
        transin: isValidGstin(company.gstin) ? "" : company.gstin,
        pan: company.pan,
        state_code: company.stateCode,
        address: [company.address, company.city].filter(Boolean).join(", "),
        tax_mode: gstMode,
        risk_clause: `${format.clause === "Owner's risk" ? "At owner's" : "At carrier's"} risk`,
        branch_name: company.branch || "Head office",
        branch_city: company.city,
        lr_prefix: format.prefix,
        inv_prefix: format.invPrefix,
        lr_starting_number: Number(format.start) > 1 ? Number(format.start) : 0,
        inv_starting_number: Number(format.invStart) || 0,
      }),
    });
    const body = await res.json();

    if (!res.ok) {
      setSubmitting(false);
      setSubmitError(body.error ?? "Something went wrong. Please try again.");
      return;
    }

    // Best-effort: a truck, driver or invite that fails to save does not
    // block the org that already exists — but "best-effort" means reporting
    // what did not make it, not staying quiet about it. A phone typed with a
    // +91, for instance, used to fail this file's OWN pre-filter below and
    // never even reach the network — dropped with nothing to see in devtools,
    // let alone on screen.
    const failures: string[] = [];
    let trucksSaved = 0;
    let driversSaved = 0;

    const driverRows = drivers.filter((d) => d.name.trim());
    const validDrivers = driverRows.filter((d) => /^[6-9]\d{9}$/.test(normaliseIndianPhone(d.phone)));
    for (const d of driverRows) {
      if (!validDrivers.includes(d)) failures.push(`Driver "${d.name}" — that phone number does not look right`);
    }

    const writes: Promise<void>[] = [
      ...trucks
        .filter((t) => t.reg.trim())
        .map(async (t) => {
          const res = await fetch("/api/vehicles", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              reg_number: t.reg,
              vehicle_type: t.type,
              ownership: t.ownership.toLowerCase(),
            }),
          });
          if (res.ok) trucksSaved += 1;
          else {
            const body = await res.json().catch(() => ({}));
            failures.push(`Truck ${t.reg || "(blank)"} — ${body.error ?? "could not be saved"}`);
          }
        }),
      ...validDrivers.map(async (d) => {
        const res = await fetch("/api/drivers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            full_name: d.name,
            phone: normaliseIndianPhone(d.phone),
            language: d.language,
          }),
        });
        if (res.ok) driversSaved += 1;
        else {
          const body = await res.json().catch(() => ({}));
          failures.push(`Driver "${d.name}" — ${body.error ?? "could not be saved"}`);
        }
      }),
      ...team
        .filter((t) => t.email.trim())
        .map(async (t) => {
          const res = await fetch("/api/organisations/invites", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: t.email, role: t.role }),
          });
          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            failures.push(`Invite to ${t.email} — ${body.error ?? "could not be sent"}`);
          }
        }),
    ];
    await Promise.all(writes);

    setSavedCounts({ trucks: trucksSaved, drivers: driversSaved });
    setSkipped(failures);
    setSubmitting(false);
    setDone(true);
  }

  return (
    <div className="min-h-dvh bg-paper text-ink">
      <header className="border-b border-line bg-paper">
        <div className="mx-auto flex h-16 max-w-[1120px] items-center justify-between px-7">
          <Link href="/" className="font-semibold text-ink">
            LogiFlow
          </Link>
          <Link
            href="/"
            className="rounded-md px-3 py-2 text-[13px] text-ink-2 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-ink"
          >
            Save and exit
          </Link>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1120px] flex-col gap-10 px-7 py-10 min-[820px]:flex-row min-[820px]:gap-16 min-[820px]:py-14">
        {signedInEmail && <StepRail step={step} done={done} onJump={(i) => !done && i < step && setStep(i)} />}

        <main className="w-full min-[820px]:max-w-[560px]">
          {!signedInEmail ? (
            <EmailSignIn
              next="/start"
              heading="Let's get your company set up."
              reason="Enter your email — we'll send a link, and you're straight into the five questions below."
            />
          ) : done ? (
            <Summary
              company={company}
              gstMode={gstMode}
              nextLrNo={nextLrNo}
              trucks={savedCounts.trucks}
              drivers={savedCounts.drivers}
              skipped={skipped}
            />
          ) : (
            <>
              {step === 0 && (
                <Step
                  heading="Tell us about your company."
                  reason="This is the name and GSTIN that print at the top of every LR you issue."
                  primary="Continue"
                  canContinue={company.name.trim().length > 1}
                  onNext={next}
                >
                  <Text
                    id="company-name"
                    label="Company name"
                    value={company.name}
                    onChange={(v) => setCompany({ ...company, name: v })}
                    placeholder="Apex Roadways"
                  />

                  <GstinField
                    value={company.gstin}
                    onChange={(gstin) => {
                      const code = stateCodeFromGstin(gstin);
                      setCompany({ ...company, gstin, stateCode: code ?? company.stateCode });
                    }}
                  />

                  <div>
                    <FieldLabel htmlFor="state">State</FieldLabel>
                    <select
                      id="state"
                      value={company.stateCode}
                      onChange={(e) => setCompany({ ...company, stateCode: e.target.value })}
                      className={inputClass}
                    >
                      <option value="">Select a state</option>
                      {GST_STATE_OPTIONS.map((s) => (
                        <option key={s.code} value={s.code}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <Text
                      id="branch"
                      label="Branch"
                      value={company.branch}
                      onChange={(v) => setCompany({ ...company, branch: v })}
                      placeholder="Head office"
                      hint="Start with the branch that books the most LRs. Add the others later."
                    />
                    <Text
                      id="city"
                      label="City"
                      value={company.city}
                      onChange={(v) => setCompany({ ...company, city: v })}
                      placeholder="Bengaluru"
                    />
                  </div>
                </Step>
              )}

              {step === 1 && (
                <Step
                  heading="Do you charge GST on your LR?"
                  reason="Set it once and every LR after this prints the right tax block — or the right note when there is no tax."
                  primary="Continue"
                  onNext={next}
                  onBack={back}
                >
                  <div className="space-y-2.5">
                    {GST_MODES.map((m) => (
                      <label
                        key={m.value}
                        className={cn(
                          "flex cursor-pointer gap-3 rounded-md border p-4 transition-colors duration-150",
                          gstMode === m.value
                            ? "border-indigo-ink bg-indigo-tint"
                            : "border-line bg-white hover:border-ink-3",
                        )}
                      >
                        <input
                          type="radio"
                          name="gst-mode"
                          value={m.value}
                          checked={gstMode === m.value}
                          onChange={() => setGstMode(m.value)}
                          className="mt-1 size-4 shrink-0 accent-indigo-ink"
                        />
                        <span>
                          <span className="block text-[14px] font-medium text-ink">{m.label}</span>
                          <span className="mt-1 block text-[13px] leading-[1.5] text-ink-2">
                            {m.consequence}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                  <p className="text-[12.5px] leading-[1.5] text-ink-3">
                    Ask your CA if you are not sure. If you have never charged GST on an LR, the
                    first one is almost certainly right — and it can be changed later in Settings.
                  </p>
                </Step>
              )}

              {step === 2 && (
                <Step
                  heading="How should your documents look?"
                  reason="Keep the series you already use, so your customers' records and ours stay in step."
                  primary="Continue"
                  onNext={next}
                  onBack={back}
                >
                  <div className="grid grid-cols-2 gap-4">
                    <Text
                      id="prefix"
                      label="LR prefix"
                      value={format.prefix}
                      onChange={(v) => setFormat({ ...format, prefix: v.toUpperCase().slice(0, 6) })}
                      mono
                    />
                    <Text
                      id="inv-prefix"
                      label="Invoice prefix"
                      value={format.invPrefix}
                      onChange={(v) => setFormat({ ...format, invPrefix: v.toUpperCase().slice(0, 6) })}
                      mono
                    />
                  </div>

                  <div className="rounded-md border border-line bg-white p-4">
                    <p className="text-[11px] font-medium tracking-[0.08em] text-ink-3">
                      YOUR NEXT LR NUMBER
                    </p>
                    <p className="mt-1.5 font-mono text-[20px] font-medium text-ink">{nextLrNo}</p>
                    <p className="mt-2 text-[12.5px] leading-[1.5] text-ink-2">
                      The middle block is the financial year. Numbers run gapless and are never
                      reused — a cancelled LR keeps its number so an audit can see it.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <Text
                      id="start"
                      label="Start LR numbers from"
                      value={format.start}
                      onChange={(v) => setFormat({ ...format, start: v.replace(/\D/g, "").slice(0, 6) })}
                      mono
                      inputMode="numeric"
                    />
                    <Text
                      id="inv-start"
                      label="Start invoice numbers from"
                      value={format.invStart}
                      onChange={(v) => setFormat({ ...format, invStart: v.replace(/\D/g, "").slice(0, 6) })}
                      mono
                      inputMode="numeric"
                    />
                  </div>
                  <p className="text-[12.5px] leading-[1.5] text-ink-3">
                    Already issuing LRs or bills on paper? Enter the next number you would have
                    written by hand for each. Leave at 0 or 1 to start fresh.
                  </p>

                  <Choice
                    id="clause"
                    label="Risk clause"
                    value={format.clause}
                    options={["Owner's risk", "Carrier's risk"]}
                    onChange={(v) => setFormat({ ...format, clause: v })}
                  />
                </Step>
              )}

              {step === 3 && (
                <Step
                  heading="Add your trucks."
                  reason="A vehicle number on the LR is what the checkpost and your customer both look for."
                  primary="Continue"
                  onNext={next}
                  onBack={back}
                  onSkip={next}
                >
                  <div className="space-y-3">
                    {trucks.map((t, i) => (
                      <Row key={i} onRemove={trucks.length > 1 ? () => setTrucks(trucks.filter((_, j) => j !== i)) : undefined}>
                        <input
                          aria-label={`Truck ${i + 1} registration`}
                          value={t.reg}
                          onChange={(e) => {
                            const copy = [...trucks];
                            copy[i] = { ...t, reg: e.target.value.toUpperCase() };
                            setTrucks(copy);
                          }}
                          onBlur={(e) => {
                            const copy = [...trucks];
                            copy[i] = { ...t, reg: e.target.value ? formatRegNumber(e.target.value) : "" };
                            setTrucks(copy);
                          }}
                          placeholder="KA-51-AB-4471"
                          className={cn(inputClass, "font-mono")}
                        />
                        <select
                          aria-label={`Truck ${i + 1} type`}
                          value={t.type}
                          onChange={(e) => {
                            const copy = [...trucks];
                            copy[i] = { ...t, type: e.target.value };
                            setTrucks(copy);
                          }}
                          className={inputClass}
                        >
                          {VEHICLE_TYPES.map((v) => (
                            <option key={v}>{v}</option>
                          ))}
                        </select>
                        <select
                          aria-label={`Truck ${i + 1} ownership`}
                          value={t.ownership}
                          onChange={(e) => {
                            const copy = [...trucks];
                            copy[i] = { ...t, ownership: e.target.value as TruckRow["ownership"] };
                            setTrucks(copy);
                          }}
                          className={inputClass}
                        >
                          <option>Own</option>
                          <option>Attached</option>
                        </select>
                      </Row>
                    ))}
                  </div>

                  <AddRow
                    label="Add another truck"
                    onClick={() => setTrucks([...trucks, { reg: "", type: VEHICLE_TYPES[0], ownership: "Own" }])}
                  />
                  <p className="text-[12.5px] leading-[1.5] text-ink-3">
                    Add a couple to start. The rest go in from Fleet whenever you have the list.
                  </p>
                </Step>
              )}

              {step === 4 && (
                <Step
                  heading="Add your drivers."
                  reason="Each trip sends a WhatsApp link to the driver on it — this is the number it goes to."
                  primary="Continue"
                  onNext={next}
                  onBack={back}
                  onSkip={next}
                >
                  <div className="space-y-3">
                    {drivers.map((d, i) => (
                      <Row key={i} onRemove={drivers.length > 1 ? () => setDrivers(drivers.filter((_, j) => j !== i)) : undefined}>
                        <input
                          aria-label={`Driver ${i + 1} name`}
                          value={d.name}
                          onChange={(e) => {
                            const copy = [...drivers];
                            copy[i] = { ...d, name: e.target.value };
                            setDrivers(copy);
                          }}
                          placeholder="Ramesh Kumar"
                          className={inputClass}
                        />
                        <input
                          aria-label={`Driver ${i + 1} phone`}
                          value={d.phone}
                          inputMode="numeric"
                          onChange={(e) => {
                            const copy = [...drivers];
                            // 16, not 13: "+91 98765 43210" (a phone's own
                            // contacts app suggestion, spaces included) is 15
                            // characters — 13 silently cut its last two
                            // digits, so a +91 number always failed
                            // validation even after normalising it.
                            copy[i] = { ...d, phone: e.target.value.replace(/[^\d +]/g, "").slice(0, 16) };
                            setDrivers(copy);
                          }}
                          placeholder="98765 43210"
                          className={cn(inputClass, "font-mono")}
                        />
                        <select
                          aria-label={`Driver ${i + 1} language`}
                          value={d.language}
                          onChange={(e) => {
                            const copy = [...drivers];
                            copy[i] = { ...d, language: e.target.value };
                            setDrivers(copy);
                          }}
                          className={inputClass}
                        >
                          {LANGUAGES.map((v) => (
                            <option key={v.value} value={v.value}>
                              {v.label}
                            </option>
                          ))}
                        </select>
                      </Row>
                    ))}
                  </div>

                  <AddRow
                    label="Add another driver"
                    onClick={() => setDrivers([...drivers, { name: "", phone: "", language: "hi" }])}
                  />
                  <p className="text-[12.5px] leading-[1.5] text-ink-3">
                    Drivers get no login and no password. They only ever see the link for the trip
                    they are on, and it stops working once delivery is confirmed.
                  </p>
                </Step>
              )}

              {step === 5 && (
                <Step
                  heading="Add your team."
                  reason="Everyone signs in with their own email — no shared logins, no passwords to hand around."
                  primary={submitting ? "Setting up…" : "Finish setup"}
                  canContinue={!submitting}
                  onNext={next}
                  onBack={back}
                  onSkip={next}
                >
                  <div className="space-y-3">
                    {team.map((t, i) => (
                      <Row key={i} onRemove={team.length > 1 ? () => setTeam(team.filter((_, j) => j !== i)) : undefined}>
                        <input
                          aria-label={`Team member ${i + 1} email`}
                          value={t.email}
                          onChange={(e) => {
                            const copy = [...team];
                            copy[i] = { ...t, email: e.target.value };
                            setTeam(copy);
                          }}
                          placeholder="priya@yourcompany.com"
                          className={cn(inputClass, "sm:col-span-2")}
                        />
                        <select
                          aria-label={`Team member ${i + 1} role`}
                          value={t.role}
                          onChange={(e) => {
                            const copy = [...team];
                            copy[i] = { ...t, role: e.target.value };
                            setTeam(copy);
                          }}
                          className={inputClass}
                        >
                          {TEAM_ROLES.map((r) => (
                            <option key={r.value} value={r.value}>
                              {r.label}
                            </option>
                          ))}
                        </select>
                      </Row>
                    ))}
                  </div>

                  <AddRow
                    label="Add another teammate"
                    onClick={() => setTeam([...team, { email: "", role: "dispatcher" }])}
                  />
                  <p className="text-[12.5px] leading-[1.5] text-ink-3">
                    We email each of them a sign-in link. Add or remove people anytime from
                    Settings.
                  </p>
                  {submitError && (
                    <p className="rounded-md bg-alert/10 p-3 text-[13px] text-alert">{submitError}</p>
                  )}
                </Step>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

/* ── Rail ────────────────────────────────────────────────────────────────── */

function StepRail({ step, done, onJump }: { step: number; done: boolean; onJump: (i: number) => void }) {
  return (
    <nav aria-label="Setup steps" className="min-[820px]:w-[260px] min-[820px]:shrink-0">
      <ol className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2 min-[820px]:sticky min-[820px]:top-10 min-[820px]:flex-col min-[820px]:gap-1 min-[820px]:overflow-visible min-[820px]:pb-0">
        {STEPS.map((s, i) => {
          const complete = done || i < step;
          const current = !done && i === step;
          return (
            <li key={s.id} className="shrink-0">
              <button
                type="button"
                onClick={() => onJump(i)}
                disabled={!complete || done}
                aria-current={current ? "step" : undefined}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13.5px] whitespace-nowrap",
                  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-ink",
                  current ? "font-medium text-ink" : complete ? "text-ink-2" : "text-ink-3",
                  complete && !done && "hover:bg-white",
                )}
              >
                <span
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-full border font-mono text-[12px]",
                    complete
                      ? "border-indigo-ink bg-indigo-ink text-white"
                      : current
                        ? "border-indigo-ink text-indigo-ink"
                        : "border-line text-ink-3",
                  )}
                >
                  {complete ? <Check className="size-3.5" strokeWidth={2.5} aria-hidden /> : i + 1}
                </span>
                {s.rail}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/* ── Step frame ──────────────────────────────────────────────────────────── */

function Step({
  heading,
  reason,
  primary,
  children,
  onNext,
  onBack,
  onSkip,
  canContinue = true,
}: {
  heading: string;
  reason: string;
  primary: string;
  children: React.ReactNode;
  onNext: () => void;
  onBack?: () => void;
  onSkip?: () => void;
  canContinue?: boolean;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (canContinue) onNext();
      }}
    >
      <h1 className="text-[28px] leading-[1.15] font-semibold tracking-[-0.01em] text-ink">
        {heading}
      </h1>
      <p className="mt-2.5 max-w-[52ch] text-[14px] leading-[1.55] text-ink-2">{reason}</p>

      <div className="mt-8 space-y-5">{children}</div>

      <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-line-soft pt-6">
        <button
          type="submit"
          disabled={!canContinue}
          className="rounded-md bg-indigo-ink px-5 py-3 text-[14px] font-medium text-white transition-colors duration-150 hover:bg-indigo-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-ink disabled:cursor-not-allowed disabled:bg-ink-3"
        >
          {primary}
        </button>
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="text-[13.5px] text-ink-2 underline underline-offset-4 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-ink"
          >
            Back
          </button>
        )}
        {onSkip && (
          <button
            type="button"
            onClick={onSkip}
            className="ml-auto text-[13.5px] text-ink-3 underline underline-offset-4 hover:text-ink-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-ink"
          >
            Skip for now
          </button>
        )}
      </div>
    </form>
  );
}

/* ── Summary ─────────────────────────────────────────────────────────────── */

function Summary({
  company,
  gstMode,
  nextLrNo,
  trucks,
  drivers,
  skipped,
}: {
  company: { name: string; stateCode: string; branch: string };
  gstMode: string;
  nextLrNo: string;
  trucks: number;
  drivers: number;
  skipped: string[];
}) {
  const gstLabel =
    gstMode === "rcm" ? "Reverse charge — customer pays" : `${gstMode === "fcm_5" ? 5 : 18}% charged on the LR`;

  return (
    <div>
      <span className="flex size-10 items-center justify-center rounded-full bg-forest-tint text-forest-ink">
        <Check className="size-5" strokeWidth={2.5} aria-hidden />
      </span>
      <h1 className="mt-5 text-[28px] font-semibold tracking-[-0.01em] text-ink">You&apos;re set up.</h1>
      <p className="mt-2.5 max-w-[52ch] text-[14px] leading-[1.55] text-ink-2">
        Everything below can be changed in Settings. Nothing here is locked in.
      </p>

      {skipped.length > 0 && (
        <div className="mt-6 rounded-md border border-alert/30 bg-alert/10 p-4">
          <p className="text-[13.5px] font-medium text-alert">
            {skipped.length === 1 ? "One thing did not save:" : `${skipped.length} things did not save:`}
          </p>
          <ul className="mt-2 space-y-1 text-[13px] leading-[1.5] text-ink-2">
            {skipped.map((line) => (
              <li key={line}>• {line}</li>
            ))}
          </ul>
          <p className="mt-2 text-[12.5px] text-ink-3">
            Everything else below is saved. Add these from Fleet or Settings.
          </p>
        </div>
      )}

      <dl className="mt-8 border-t border-line-soft">
        <SummaryRow term="Company" value={company.name || "—"} />
        <SummaryRow term="Registered state" value={stateName(company.stateCode) ?? "Not set"} />
        <SummaryRow term="GST on your LR" value={gstLabel} />
        <SummaryRow term="Next LR number" value={nextLrNo} mono />
        <SummaryRow
          term="Trucks and drivers"
          value={`${trucks} truck${trucks === 1 ? "" : "s"}, ${drivers} driver${drivers === 1 ? "" : "s"}`}
        />
      </dl>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <Link
          href="/consignments/new"
          className="rounded-md bg-indigo-ink px-5 py-3 text-[14px] font-medium text-white transition-colors duration-150 hover:bg-indigo-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-ink"
        >
          Create your first LR
        </Link>
        <Link
          href="/dashboard"
          className="rounded-md border border-line bg-white px-5 py-3 text-[14px] font-medium text-ink transition-colors duration-150 hover:border-ink-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-ink"
        >
          Go to dashboard
        </Link>
      </div>
    </div>
  );
}

function SummaryRow({ term, value, mono }: { term: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-6 border-b border-line-soft py-3">
      <dt className="text-[13.5px] text-ink-2">{term}</dt>
      <dd className={cn("text-right text-[13.5px] font-medium text-ink", mono && "font-mono")}>
        {value}
      </dd>
    </div>
  );
}

/* ── Fields ──────────────────────────────────────────────────────────────── */

const inputClass =
  "w-full rounded-md border border-line bg-white px-3 py-2.5 text-[14px] text-ink placeholder:text-ink-3 focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-indigo-ink";

function FieldLabel({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-[13px] font-medium text-ink">
      {children}
    </label>
  );
}

function Text({
  id,
  label,
  value,
  onChange,
  hint,
  mono,
  ...props
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  mono?: boolean;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value">) {
  return (
    <div>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(inputClass, mono && "font-mono")}
        {...props}
      />
      {hint && <p className="mt-1.5 text-[12.5px] text-ink-3">{hint}</p>}
    </div>
  );
}

/**
 * GSTIN carries the state in its first two digits, so typing it answers the
 * next question too. The hint says which way it went — silent auto-fill is
 * how people end up registered in the wrong state.
 */
function GstinField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const trimmed = value.trim();
  const state = stateName(stateCodeFromGstin(trimmed));

  let hint = "15 characters. If you are not GST registered, enter your TRANSIN instead.";
  let tone = "text-ink-3";

  if (trimmed.length === 15) {
    if (isValidGstin(trimmed) && state) {
      hint = `Looks right. State set to ${state}.`;
      tone = "text-forest-ink";
    } else {
      hint = "Check this one — the last character does not match the rest of the number.";
      tone = "text-alert";
    }
  }

  return (
    <div>
      <FieldLabel htmlFor="gstin">GSTIN or transporter ID</FieldLabel>
      <input
        id="gstin"
        value={value}
        onChange={(e) => onChange(e.target.value.toUpperCase().replace(/\s/g, "").slice(0, 15))}
        placeholder="29AAACA1234F1Z6"
        spellCheck={false}
        className={cn(inputClass, "font-mono uppercase")}
      />
      <p className={cn("mt-1.5 text-[12.5px]", tone)}>{hint}</p>
    </div>
  );
}

function Choice({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={inputClass}>
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </div>
  );
}

function Row({ children, onRemove }: { children: React.ReactNode; onRemove?: () => void }) {
  return (
    <div className="flex items-start gap-2">
      <div className="grid flex-1 gap-2 sm:grid-cols-[1.3fr_1fr_0.8fr]">{children}</div>
      <button
        type="button"
        onClick={onRemove}
        disabled={!onRemove}
        aria-label="Remove row"
        className="mt-2.5 shrink-0 text-ink-3 hover:text-alert disabled:invisible focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-ink"
      >
        <X className="size-4" strokeWidth={1.75} aria-hidden />
      </button>
    </div>
  );
}

function AddRow({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 text-[13.5px] font-medium text-indigo-ink hover:text-indigo-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-ink"
    >
      <Plus className="size-4" strokeWidth={2} aria-hidden />
      {label}
    </button>
  );
}
