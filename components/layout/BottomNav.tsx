"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Compass,
  UserRound,
  Settings,
  MoreHorizontal,
  Wind,
  Activity,
  Radio,
  HeartPulse,
  Database,
  ShieldCheck,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";

const ITEMS = [
  { href: "/", label: "Home", icon: Home },
  { href: "/route-advisor", label: "Advisor", icon: Compass },
  { href: "/profile", label: "Profile", icon: UserRound },
  { href: "/settings", label: "Settings", icon: Settings },
];

// Everything reachable from NavBar's desktop nav (plus the Footer's data/
// privacy links) that doesn't fit as its own bottom-tab slot — surfaced
// through the "More" panel below instead, so no page is unreachable on
// mobile even though only 4 destinations fit as dedicated tabs.
const MORE_ITEMS = [
  { href: "/air-quality", label: "Air Quality", icon: Wind, description: "Nationwide live station map" },
  { href: "/traffic-data", label: "Traffic Data", icon: Activity, description: "Live per-road congestion map" },
  { href: "/live-exposure", label: "Live Exposure Demo", icon: Radio, description: "Real-time ride exposure telemetry" },
  { href: "/system-status", label: "System Status", icon: HeartPulse, description: "Data source & API health" },
  { href: "/data", label: "Data sources", icon: Database, description: "What's real vs. synthetic" },
  { href: "/privacy", label: "Privacy & data governance", icon: ShieldCheck },
];

// Mobile-only bottom tab bar (hidden on desktop, where NavBar's top nav
// covers navigation instead). Fixed to the viewport bottom with safe-area
// padding for the iOS home indicator / Android gesture bar. Only the four
// most essential destinations get a dedicated tab; every other page NavBar
// links to on desktop (plus Footer's Data sources/Privacy, which is itself
// desktop-only) is reachable via the 5th "More" tab's panel, so nothing
// available on desktop is unreachable on mobile.
export function BottomNav() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
  const moreActive = MORE_ITEMS.some((item) => isActive(item.href));

  // Close the panel on navigation (route change) rather than leaving it
  // open over the newly-loaded page.
  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  return (
    <>
      {moreOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/30 lg:hidden"
          onClick={() => setMoreOpen(false)}
          aria-hidden="true"
        />
      )}

      {moreOpen && (
        <div
          className="safe-bottom fixed inset-x-0 bottom-[64px] z-40 mx-auto w-full max-w-md rounded-t-2xl border-t border-x border-[var(--card-border)] bg-white shadow-[0_-8px_30px_rgba(15,23,42,0.15)] lg:hidden"
          role="dialog"
          aria-label="More pages"
        >
          <div className="flex items-center justify-between border-b border-[var(--card-border)] px-4 py-3">
            <span className="text-sm font-semibold text-slate-900">More</span>
            <button
              onClick={() => setMoreOpen(false)}
              aria-label="Close"
              className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="max-h-[60vh] divide-y divide-slate-100 overflow-y-auto">
            {MORE_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex min-h-[56px] items-center gap-3 px-4 py-3 active:bg-slate-100",
                    active ? "bg-[var(--brand)]/5 text-[var(--brand-dark)]" : "text-slate-700 hover:bg-slate-50"
                  )}
                >
                  <Icon className={cn("h-5 w-5 shrink-0", active ? "text-[var(--brand-dark)]" : "text-slate-400")} />
                  <span className="flex-1">
                    <span className="block text-sm font-medium">{item.label}</span>
                    {item.description && (
                      <span className="block text-xs text-slate-400">{item.description}</span>
                    )}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      <nav
        className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-[var(--card-border)] bg-white/95 backdrop-blur lg:hidden"
        aria-label="Primary"
      >
        <div className="mx-auto flex max-w-md items-stretch justify-around">
          {ITEMS.map((item) => {
            const active = isActive(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex min-w-[56px] flex-1 flex-col items-center justify-center gap-1 py-2.5 text-[11px] font-medium transition-colors",
                  active ? "text-[var(--brand-dark)]" : "text-slate-400 hover:text-slate-600"
                )}
              >
                <Icon className={cn("h-6 w-6", active && "fill-[var(--brand)]/10")} strokeWidth={active ? 2.4 : 2} />
                {item.label}
              </Link>
            );
          })}
          <button
            onClick={() => setMoreOpen((v) => !v)}
            aria-expanded={moreOpen}
            aria-label="More pages"
            className={cn(
              "flex min-w-[56px] flex-1 flex-col items-center justify-center gap-1 py-2.5 text-[11px] font-medium transition-colors",
              moreOpen || moreActive ? "text-[var(--brand-dark)]" : "text-slate-400 hover:text-slate-600"
            )}
          >
            <MoreHorizontal className={cn("h-6 w-6", (moreOpen || moreActive) && "fill-[var(--brand)]/10")} strokeWidth={moreOpen || moreActive ? 2.4 : 2} />
            More
          </button>
        </div>
      </nav>
    </>
  );
}
