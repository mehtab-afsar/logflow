"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Mark } from "@/components/brand/Mark";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "#why", label: "Why" },
  { href: "#how", label: "How it works" },
  { href: "#tracking", label: "Tracking" },
  { href: "#india", label: "Built for India" },
];

/**
 * Sticky 64px bar. Links and Sign in drop below 860px; "Book a demo" never does.
 *
 * The bottom hairline appears only once the page has scrolled. At rest the bar
 * sits on the same white as the hero and a rule under it would be a line drawn
 * across nothing; the moment content passes beneath it the rule is doing real
 * work. The transparent border is kept in the unscrolled state so the bar does
 * not shift a pixel when it appears.
 */
export function SiteNav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-30 border-b bg-white/90 backdrop-blur-sm transition-colors duration-150",
        scrolled ? "border-line" : "border-transparent",
      )}
    >
      <nav className="mx-auto flex h-16 max-w-[1120px] items-center gap-6 px-7">
        <Link
          href="/"
          className="flex items-center gap-2 font-semibold text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-indigo-ink"
        >
          <span className="flex size-7 items-center justify-center rounded-md bg-indigo-ink text-white">
            <Mark className="size-4" aria-hidden />
          </span>
          LogiFlow
        </Link>

        <ul className="ml-4 hidden items-center gap-7 min-[860px]:flex">
          {LINKS.map((l) => (
            <li key={l.href}>
              <a
                href={l.href}
                className="text-[15px] text-ink-2 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-indigo-ink"
              >
                {l.label}
              </a>
            </li>
          ))}
        </ul>

        <div className="ml-auto flex items-center gap-2">
          <Link
            href="/login"
            className="hidden rounded-[8px] px-3 py-2 text-[15px] text-ink-2 hover:text-ink min-[860px]:block focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-indigo-ink"
          >
            Sign in
          </Link>
          <a
            href="#demo"
            className="rounded-[8px] bg-ink px-4 py-[9px] text-[14px] font-medium text-white transition-colors duration-150 hover:bg-ink-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-indigo-ink"
          >
            Book a demo
          </a>
        </div>
      </nav>
    </header>
  );
}
