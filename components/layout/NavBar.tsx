"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

// Desktop-only top nav — on mobile/tablet, BottomNav covers primary
// navigation instead, per the mobile-first redesign.
const PRIMARY_NAV_ITEMS = [
  { href: "/", label: "Home" },
  { href: "/route-advisor", label: "AI Route Advisor" },
  { href: "/air-quality", label: "Air Quality" },
  { href: "/traffic-data", label: "Traffic Data" },
  { href: "/live-exposure", label: "Live Exposure Demo" },
  { href: "/profile", label: "Rider Profile" },
  { href: "/system-status", label: "System Status" },
];

export function NavBar() {
  const pathname = usePathname();

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <header className="sticky top-0 z-40 hidden border-b border-[var(--card-border)] bg-[var(--card)]/90 backdrop-blur lg:block">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2">
          <Image src="/logo.png" alt="" width={32} height={32} className="h-8 w-8" priority />
          <div className="leading-tight">
            <div className="text-sm font-bold tracking-tight text-[var(--brand-title)]">
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
        </nav>
      </div>
    </header>
  );
}
