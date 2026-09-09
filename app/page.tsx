import Link from "next/link";
import { SiteNav } from "@/features/marketing/components/SiteNav";
import { HeroLr } from "@/features/marketing/components/HeroLr";
import { PaperDelay } from "@/features/marketing/components/PaperDelay";
import { HowItWorks } from "@/features/marketing/components/HowItWorks";
import { TrackingDemo } from "@/features/marketing/components/TrackingDemo";
import { BuiltForIndia } from "@/features/marketing/components/BuiltForIndia";
import { DemoForm } from "@/features/marketing/components/DemoForm";
import { SiteFooter } from "@/features/marketing/components/SiteFooter";
import { Reveal } from "@/features/marketing/components/Reveal";

export const metadata = {
  title: "LogiFlow — your LR book, POD and freight bill in one place",
  description:
    "Dispatch software for Indian FTL transporters running 5 to 60 trucks. Digital lorry receipts, WhatsApp-based driver updates, digital proof of delivery and same-day freight billing.",
};

/**
 * One job: turn a transporter owner into a booked 20-minute demo. The second
 * job — letting a curious owner start a pilot alone — is the /start wizard,
 * which is why the two hero buttons go to different places rather than both
 * scrolling to the form.
 *
 * The hero fills the first screen on its own — headline, lede, the two
 * buttons and the fine print, vertically centred in the space under the nav.
 * The lorry receipt is the reveal on the next scroll, not something you see
 * without scrolling: it is the page's one memorable element precisely
 * because it arrives as its own beat rather than competing with the headline
 * for the same screen. It runs the full width of the container because a
 * lorry receipt is a landscape document and cropping it into a column makes
 * it read as a screenshot of software instead of the piece of paper it is
 * replacing. Everything below it is deliberately quiet: hairlines instead of
 * cards, one action colour, and colour used nowhere except status.
 */
export default function LandingPage() {
  return (
    <div className="min-h-dvh bg-white text-ink">
      <SiteNav />

      <main>
        <section className="mx-auto flex min-h-[calc(100dvh-64px)] max-w-[1120px] flex-col justify-center px-7">
          <Reveal>
            <h1 className="max-w-[16ch] text-[clamp(38px,5vw,62px)] leading-[1.04] font-medium tracking-[-0.03em] text-balance">
              Your LR book, POD and freight bill. One place, one minute.
            </h1>
          </Reveal>
          <Reveal delay={100}>
            <p className="mt-6 max-w-[52ch] text-[19px] leading-[1.5] text-ink-2">
              Built for Indian transporters running 5 to 60 trucks. Drivers need only WhatsApp.
              Customers stop calling. You raise the bill the same day the truck is unloaded.
            </p>
          </Reveal>

          <Reveal delay={200} className="mt-8 flex flex-wrap items-center gap-3">
            <a
              href="#demo"
              className="rounded-[8px] bg-ink px-6 py-[15px] text-[16px] font-medium text-white transition-all duration-150 hover:-translate-y-px hover:bg-ink-2 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-indigo-ink"
            >
              Book a 20-minute demo
            </a>
            <Link
              href="/start"
              className="rounded-[8px] border border-line bg-white px-6 py-[15px] text-[16px] font-medium text-ink transition-all duration-150 hover:-translate-y-px hover:bg-paper hover:shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-indigo-ink"
            >
              Start a free pilot
            </Link>
          </Reveal>

          <Reveal delay={300}>
            <p className="mt-4 text-[14px] leading-[1.55] text-ink-3">
              No app for drivers. No per-LR charges. 30 days free for the first five fleets.
            </p>
          </Reveal>
        </section>

        <section className="mx-auto max-w-[1120px] px-7 pb-[104px]">
          <Reveal>
            <HeroLr />
          </Reveal>
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
