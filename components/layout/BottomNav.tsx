"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Map, History, Settings } from "lucide-react";
import { cn } from "@/lib/cn";

const ITEMS = [
  { href: "/navigate", label: "Home", icon: Home },
  { href: "/exposure-map", label: "Map", icon: Map },
  { href: "/trip-history", label: "Trips", icon: History },
  { href: "/settings", label: "Settings", icon: Settings },
];

// Mobile-only bottom tab bar (hidden on desktop, where NavBar's top nav
// covers navigation instead). Fixed to the viewport bottom with safe-area
// padding for the iOS home indicator / Android gesture bar.
export function BottomNav() {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
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
                "flex min-w-[64px] flex-1 flex-col items-center justify-center gap-1 py-2.5 text-[11px] font-medium transition-colors",
                active ? "text-[var(--brand-dark)]" : "text-slate-400 hover:text-slate-600"
              )}
            >
              <Icon className={cn("h-6 w-6", active && "fill-[var(--brand)]/10")} strokeWidth={active ? 2.4 : 2} />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
