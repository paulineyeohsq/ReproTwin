"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { Activity, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Menu, X } from "lucide-react";

const PRIMARY_NAV_ITEMS = [
  { href: "/", label: "Dashboard" },
  { href: "/navigate", label: "Navigate" },
  { href: "/exposure-map", label: "Exposure Map" },
  { href: "/trip-history", label: "Trip History" },
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
  const [open, setOpen] = useState(false);
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
    <header className="sticky top-0 z-40 border-b border-[var(--card-border)] bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--brand)] text-white">
            <Activity className="h-4.5 w-4.5" />
          </span>
          <div className="leading-tight">
            <div className="text-sm font-bold tracking-tight text-slate-900">
              ReproTwin
            </div>
            <div className="hidden text-[10px] uppercase tracking-wide text-slate-500 sm:block">
              Exposure-Aware Navigation
            </div>
          </div>
        </Link>

        <nav className="hidden items-center gap-1 lg:flex">
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

        <button
          className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
          onClick={() => setOpen((o) => !o)}
          aria-label="Toggle navigation"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open && (
        <nav className="flex flex-col gap-1 border-t border-[var(--card-border)] bg-white px-4 py-2 lg:hidden">
          {PRIMARY_NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className={cn(
                "rounded-lg px-3 py-2 text-sm font-medium",
                isActive(item.href)
                  ? "bg-[var(--brand)]/10 text-[var(--brand-dark)]"
                  : "text-slate-600 hover:bg-slate-100"
              )}
            >
              {item.label}
            </Link>
          ))}
          <div className="mt-1 border-t border-[var(--card-border)] pt-1">
            <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              Research tools
            </p>
            {RESEARCH_NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "block rounded-lg px-3 py-2 text-sm font-medium",
                  isActive(item.href)
                    ? "bg-[var(--brand)]/10 text-[var(--brand-dark)]"
                    : "text-slate-600 hover:bg-slate-100"
                )}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </nav>
      )}
    </header>
  );
}
