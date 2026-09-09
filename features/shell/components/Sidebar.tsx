"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, FileText, Receipt, Truck, Users, Settings,
} from "lucide-react";
import { Mark } from "@/components/brand/Mark";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard",    label: "Today",        icon: LayoutDashboard },
  { href: "/consignments", label: "Lorry receipts", icon: FileText },
  { href: "/bills",        label: "Freight bills", icon: Receipt },
  { href: "/fleet",        label: "Fleet",         icon: Truck },
  { href: "/parties",      label: "Parties",       icon: Users },
  { href: "/settings",     label: "Settings",      icon: Settings },
] as const;

/**
 * A 60px icon rail that expands to 240px while the pointer is over it.
 *
 * The expansion is an OVERLAY, not a width change in the flex row: the outer
 * <div> is a permanent 60px spacer and the <aside> is absolutely positioned
 * inside it. If the aside itself grew, every register table to its right would
 * re-layout on each hover — a visible shudder on a page of forty rows, and a
 * reflow of the whole document sixty times a minute while someone reads.
 *
 * It is CSS-only — `group-hover` and `group-focus-within`, no React state.
 * State here would mean a listener per mount and a re-render per hover, and it
 * would leave keyboard users out unless the focus handlers exactly mirrored the
 * pointer ones. `focus-within` gets tab-through expansion for free.
 *
 * Labels stay in the DOM and stay readable to a screen reader even when clipped
 * — they are the accessible name of each link. Hiding them with `aria-hidden`
 * would leave six links called nothing but their icon.
 *
 * Reduced motion is handled globally in globals.css, which forces every
 * transition-duration to ~0. The rail then snaps instead of sliding.
 */
export function Sidebar({ orgName, userName }: { orgName: string; userName: string }) {
  const pathname = usePathname();

  return (
    <div className="group relative w-[60px] shrink-0">
      <aside
        className={cn(
          "absolute inset-y-0 left-0 z-40 flex w-[60px] flex-col overflow-hidden",
          "border-r bg-white transition-[width,box-shadow] duration-200 ease-out",
          "group-hover:w-60 group-hover:shadow-lg",
          "group-focus-within:w-60 group-focus-within:shadow-lg",
        )}
      >
        {/* pl-3.5 puts the 32px mark and the 16px nav icons on the same
            centreline — 30px, the middle of the 60px rail — so nothing shifts
            horizontally as the panel opens. */}
        <div className="flex items-center gap-2.5 py-4 pl-3.5 pr-4">
          {/* The mark, not the Truck icon — that one belongs to Fleet, below. */}
          <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Mark className="size-4" />
          </div>
          <div className="min-w-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100">
            <p className="truncate text-sm font-semibold leading-tight">{orgName}</p>
            <p className="truncate text-xs text-ink-3">{userName}</p>
          </div>
        </div>

        <nav className="flex-1 space-y-0.5 py-2">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "mx-2 flex items-center gap-2.5 rounded-md py-2 pl-3.5 pr-2.5 text-sm transition-colors duration-150",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-ink-2 hover:bg-line-soft",
                )}
              >
                <Icon className="size-4 shrink-0" strokeWidth={1.5} />
                <span className="truncate opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100">
                  {label}
                </span>
              </Link>
            );
          })}
        </nav>

        {/* No sign-out yet: there is no login screen. Accounts and onboarding
            are a later phase. */}
      </aside>
    </div>
  );
}
