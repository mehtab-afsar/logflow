"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, FileText, Receipt, Truck, Users, Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard",    label: "Today",        icon: LayoutDashboard },
  { href: "/consignments", label: "Lorry receipts", icon: FileText },
  { href: "/bills",        label: "Freight bills", icon: Receipt },
  { href: "/fleet",        label: "Fleet",         icon: Truck },
  { href: "/parties",      label: "Parties",       icon: Users },
  { href: "/settings",     label: "Settings",      icon: Settings },
] as const;

export function Sidebar({ orgName, userName }: { orgName: string; userName: string }) {
  const pathname = usePathname();

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r bg-white">
      <div className="flex items-center gap-2.5 px-4 py-4">
        <div className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Truck className="size-4" strokeWidth={1.5} />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold leading-tight">{orgName}</p>
          <p className="truncate text-xs text-neutral-500">{userName}</p>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 px-2 py-2">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors duration-150",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-neutral-700 hover:bg-neutral-100",
              )}
            >
              <Icon className="size-4 shrink-0" strokeWidth={1.5} />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* No sign-out yet: there is no login screen. Accounts and onboarding
          are a later phase. */}
    </aside>
  );
}
