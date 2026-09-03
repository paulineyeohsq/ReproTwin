"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { Activity, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";

// Desktop-only top nav — on mobile/tablet, BottomNav (Home/Map/Trips/
// Settings) covers primary navigation instead, per the mobile-first
// redesign. Dashboard/System Status stay reachable from desktop as the
// research/monitoring views (see section 24 of the redesign brief).
const PRIMARY_NAV_ITEMS = [
  { href: "/navigate", label: "Home" },
  { href: "/exposure-map", label: "Exposure Map" },
  { href: "/trip-history", label: "Trip History" },
  { href: "/", label: "Dashboard" },
  { href: "/system-status", label: "System Status" },
];

// Kept for continuity with earlier work, but not core to the navigation
// product — demoted out of the primary nav per the research-tools scope
// decision (see project memory / conversation history), not deleted.
const RESEARCH_NAV_ITEMS = [
  { href: "/route-advisor", label: "AI Route Advisor (research)" },
  { href: "/digital-twin", label: "Digital Twin (research)" },
  { href: "/simulator", label: "What-If Simulator (research)" },
  { href: "/live-exposure", label: "Live Exposure Demo (research)" },
  { href: "/profile", label: "Rider Profile (future functionality)" },
];

export function NavBar() {
  const pathname = usePathname();
  const [researchOpen, setResearchOpen] = useState(false);
  const researchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (researchRef.current && !researchRef.current.contains(e.target as Node)) {
        setResearchOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const researchActive = RESEARCH_NAV_ITEMS.some((item) => isActive(item.href));

  return (
    <header className="sticky top-0 z-40 hidden border-b border-[var(--card-border)] bg-white/90 backdrop-blur lg:block">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link href="/navigate" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--brand)] text-white">
            <Activity className="h-4.5 w-4.5" />
          </span>
          <div className="leading-tight">
            <div className="text-sm font-bold tracking-tight text-slate-900">
              E-Navigate
            </div>
            <div className="hidden text-[10px] uppercase tracking-wide text-slate-500 sm:block">
              Exposure-Aware Navigation
            </div>
          </div>
        </Link>

        <nav className="flex items-center gap-1">
          {PRIMARY_NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive(item.href)
                  ? "bg-[var(--brand)]/10 text-[var(--brand-dark)]"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              )}
            >
              {item.label}
            </Link>
          ))}

          <div className="relative" ref={researchRef}>
            <button
              onClick={() => setResearchOpen((v) => !v)}
              className={cn(
                "flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                researchActive
                  ? "bg-[var(--brand)]/10 text-[var(--brand-dark)]"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              )}
            >
              Research tools <ChevronDown className="h-3.5 w-3.5" />
            </button>
            {researchOpen && (
              <div className="absolute right-0 top-full mt-1 w-64 rounded-lg border border-[var(--card-border)] bg-white p-1 shadow-lg">
                {RESEARCH_NAV_ITEMS.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setResearchOpen(false)}
                    className={cn(
                      "block rounded-md px-3 py-2 text-sm",
                      isActive(item.href)
                        ? "bg-[var(--brand)]/10 text-[var(--brand-dark)]"
                        : "text-slate-600 hover:bg-slate-100"
                    )}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </nav>
      </div>
    </header>
  );
}
