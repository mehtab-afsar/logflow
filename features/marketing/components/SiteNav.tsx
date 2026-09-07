import Link from "next/link";
import { Mark } from "@/components/brand/Mark";

const LINKS = [
  { href: "#why", label: "Why" },
  { href: "#how", label: "How it works" },
  { href: "#tracking", label: "Tracking" },
  { href: "#india", label: "Built for India" },
];

/** Sticky 64px bar. Links drop below 820px; the two actions never do. */
export function SiteNav() {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-paper/90 backdrop-blur-sm">
      <nav className="mx-auto flex h-16 max-w-[1120px] items-center gap-6 px-7">
        <Link href="/" className="flex items-center gap-2 font-semibold text-ink">
          <span className="flex size-7 items-center justify-center rounded-md bg-indigo-ink text-white">
            <Mark className="size-4" aria-hidden />
          </span>
          LogiFlow
        </Link>

        <ul className="ml-4 hidden items-center gap-6 min-[820px]:flex">
          {LINKS.map((l) => (
            <li key={l.href}>
              <a
                href={l.href}
                className="text-[14px] text-ink-2 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo-ink"
              >
                {l.label}
              </a>
            </li>
          ))}
        </ul>

        <div className="ml-auto flex items-center gap-2">
          <Link
            href="/login"
            className="rounded-md px-3 py-2 text-[14px] text-ink-2 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-ink"
          >
            Sign in
          </Link>
          <a
            href="#demo"
            className="rounded-md bg-indigo-ink px-4 py-2 text-[14px] font-medium text-white transition-colors duration-150 hover:bg-indigo-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-ink"
          >
            Book a demo
          </a>
        </div>
      </nav>
    </header>
  );
}
