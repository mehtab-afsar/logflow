import Link from "next/link";
import { SiteNav } from "@/features/marketing/components/SiteNav";
import { HeroLr } from "@/features/marketing/components/HeroLr";
import { PaperDelay } from "@/features/marketing/components/PaperDelay";
import { HowItWorks } from "@/features/marketing/components/HowItWorks";
import { TrackingDemo } from "@/features/marketing/components/TrackingDemo";
import { BuiltForIndia } from "@/features/marketing/components/BuiltForIndia";
import { DemoForm } from "@/features/marketing/components/DemoForm";
import { SiteFooter } from "@/features/marketing/components/SiteFooter";

export const metadata = {
  title: "LogiFlow — your LR book, POD and freight bill in one place",
  description:
    "Dispatch software for Indian FTL transporters running 5 to 60 trucks. Digital lorry receipts, WhatsApp-based driver updates, digital proof of delivery and same-day freight billing.",
};

/**
 * One job: turn a transporter owner into a booked 20-minute demo. The second
 * job — letting a curious owner start a pilot alone — is the /start wizard.
 *
 * The page has exactly one memorable element, the lorry receipt in the hero.
 * Everything below it is deliberately quiet: hairlines instead of cards, one
 * action colour, and colour used nowhere except status.
 */
export default function LandingPage() {
  return (
    <div className="min-h-dvh bg-paper text-ink">
      <SiteNav />

      <main>
        <section className="mx-auto grid max-w-[1120px] items-start gap-12 px-7 pt-14 pb-[72px] min-[900px]:grid-cols-[minmax(0,1fr)_minmax(0,520px)] min-[900px]:pt-20">
          <div>
            <h1 className="max-w-[14ch] text-[clamp(34px,5vw,52px)] leading-[1.08] font-semibold tracking-[-0.02em] text-balance">
              Your LR book, POD and freight bill. One place, one minute.
            </h1>
            <p className="mt-6 max-w-[54ch] text-[18px] leading-[1.55] text-ink-2">
              Built for Indian transporters running 5 to 60 trucks. Drivers need only WhatsApp.
              Customers stop calling. You raise the bill the same day the truck is unloaded.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a
                href="#demo"
                className="rounded-md bg-indigo-ink px-5 py-3 text-[14px] font-medium text-white transition-colors duration-150 hover:bg-indigo-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-ink"
              >
                Book a 20-minute demo
              </a>
              <Link
                href="/start"
                className="rounded-md border border-line bg-white px-5 py-3 text-[14px] font-medium text-ink transition-colors duration-150 hover:border-ink-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-ink"
              >
                Start a free pilot
              </Link>
            </div>

            <p className="mt-5 max-w-[46ch] text-[13px] leading-[1.55] text-ink-3">
              No app for drivers. No per-LR charges. 30 days free for the first five fleets.
            </p>
          </div>

          <HeroLr />
        </section>

        <PaperDelay />
        <HowItWorks />
        <TrackingDemo />
        <BuiltForIndia />
        <DemoForm />
      </main>

      <SiteFooter />
    </div>
  );
}
