"use client";

import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { LayoutDashboard, UserRound, History, Map } from "lucide-react";

const TABS = [
  { key: "overview", label: "Overview", icon: LayoutDashboard },
  { key: "profile", label: "Profile", icon: UserRound },
  { key: "trips", label: "Trip History", icon: History },
  { key: "map", label: "Exposure Map", icon: Map },
] as const;

type TabKey = (typeof TABS)[number]["key"];

// Rider Profile absorbed what used to be four separate pages (Dashboard's
// stats/trend/recommendations, the Profile form, Trip History, and the
// Exposure Map) — this renders whichever one server-fetched panel is
// active, so each tab still gets its own server-rendered data without the
// page needing four separate routes. ?tab=<key> deep-links a specific
// panel (e.g. from Settings or Trip Details) without needing
// useSearchParams/Suspense, since the initial tab is read client-side.
export function ProfileTabs({
  overview,
  profileTab,
  tripHistory,
  exposureMap,
}: {
  overview: ReactNode;
  profileTab: ReactNode;
  tripHistory: ReactNode;
  exposureMap: ReactNode;
}) {
  const [active, setActive] = useState<TabKey>("overview");

  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get("tab");
    if (TABS.some((t) => t.key === tab)) setActive(tab as TabKey);
  }, []);

  const panels: Record<TabKey, ReactNode> = {
    overview,
    profile: profileTab,
    trips: tripHistory,
    map: exposureMap,
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Rider Profile</h1>
        <p className="mt-1 text-sm text-slate-500">
          Your status, identity, ride history and exposure hotspots in one place.
        </p>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-[var(--card-border)]">
        {TABS.map((t) => {
          const Icon = t.icon;
          const isActive = active === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setActive(t.key)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "border-[var(--brand)] text-[var(--brand-dark)]"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              )}
            >
              <Icon className="h-4 w-4" /> {t.label}
            </button>
          );
        })}
      </div>

      <div>{panels[active]}</div>
    </div>
  );
}
