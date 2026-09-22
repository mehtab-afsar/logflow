import Link from "next/link";
import { Mark } from "@/components/brand/Mark";

export function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto max-w-[1120px] px-7 py-14">
        <div className="flex flex-wrap items-start justify-between gap-10">
          <div className="max-w-[32ch]">
            <Link href="/" className="flex items-center gap-2 font-semibold text-ink">
              <span className="flex size-7 items-center justify-center rounded-md bg-indigo-ink text-white">
                <Mark className="size-4" aria-hidden />
              </span>
              LogiFlow
            </Link>
            <p className="mt-3 text-[14px] leading-[1.55] text-ink-3">
              Your LR book, POD and freight bill. Built for Indian FTL fleets running 5 to 60
              trucks.
            </p>
          </div>

          <div className="flex flex-wrap gap-x-14 gap-y-8">
            <div className="flex flex-col gap-2.5">
              <span className="text-[12px] font-medium tracking-[0.04em] text-ink-3 uppercase">
                Product
              </span>
              <a href="#why" className="text-[13.5px] text-ink-2 hover:text-ink">Why</a>
              <a href="#how" className="text-[13.5px] text-ink-2 hover:text-ink">How it works</a>
              <a href="#tracking" className="text-[13.5px] text-ink-2 hover:text-ink">Tracking</a>
              <a href="#india" className="text-[13.5px] text-ink-2 hover:text-ink">Built for India</a>
              <a href="#faq" className="text-[13.5px] text-ink-2 hover:text-ink">FAQ</a>
            </div>
            <div className="flex flex-col gap-2.5">
              <span className="text-[12px] font-medium tracking-[0.04em] text-ink-3 uppercase">
                Account
              </span>
              <Link href="/login" className="text-[13.5px] text-ink-2 hover:text-ink">Sign in</Link>
              <a href="#demo" className="text-[13.5px] text-ink-2 hover:text-ink">Book a demo</a>
            </div>
          </div>
        </div>

        <div className="mt-12 flex flex-wrap items-center justify-between gap-4 border-t border-line-soft pt-6 text-[13px] text-ink-3">
          <span>© {new Date().getFullYear()} LogiFlow · Bengaluru, Karnataka</span>
          <span className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <a href="mailto:hello@logiflow.in" className="hover:text-ink-2">hello@logiflow.in</a>
            <a href="tel:+919876543210" className="font-mono hover:text-ink-2">+91 98765 43210</a>
            <a href="#" className="hover:text-ink-2">Terms</a>
            <a href="#" className="hover:text-ink-2">Privacy</a>
          </span>
        </div>
      </div>
    </footer>
  );
}
