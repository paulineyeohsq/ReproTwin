"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Navigation, ChevronRight } from "lucide-react";
import { ExposureBadge } from "@/components/ui/Badge";
import { getAllTrips, type RecordedTrip } from "@/lib/tripStore";
import { classifyPm25 } from "@/lib/exposure";

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("en-MY", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kuala_Lumpur" });
}

// This tab is client-only (IndexedDB), so both the server-rendered HTML and
// the hydrated client start from an identical "Loading…" state before any
// trip/timestamp data exists — using new Date() ("today"/"yesterday") here
// carries no hydration-mismatch risk the way it would on a page that
// renders real timestamps during SSR.
function groupLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-MY", { weekday: "long", day: "numeric", month: "short", timeZone: "Asia/Kuala_Lumpur" });
}

export function MyRidesTab() {
  const [trips, setTrips] = useState<RecordedTrip[] | null>(null);

  useEffect(() => {
    getAllTrips()
      .then(setTrips)
      .catch(() => setTrips([]));
  }, []);

  if (trips === null) {
    return <p className="px-1 text-sm text-slate-400">Loading…</p>;
  }

  if (trips.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
        No recorded rides yet.{" "}
        <Link href="/navigate" className="text-[var(--brand-dark)] underline">
          Start a ride
        </Link>{" "}
        to record one.
      </div>
    );
  }

  const groups = new Map<string, RecordedTrip[]>();
  for (const t of trips) {
    const key = groupLabel(t.startedAt);
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }

  return (
    <div className="space-y-5">
      {Array.from(groups.entries()).map(([label, group]) => (
        <div key={label}>
          <p className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            {group.map((t, i) => {
              const level = classifyPm25(t.avgPm25);
              return (
                <Link
                  key={t.id}
                  href={`/trip-details/${t.id}`}
                  className={`flex min-h-[64px] items-center gap-3 px-4 py-3 hover:bg-slate-50 active:bg-slate-100 ${
                    i > 0 ? "border-t border-slate-100" : ""
                  }`}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--brand)]/10 text-[var(--brand-dark)]">
                    <Navigation className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px] font-semibold text-slate-800">{t.destinationLabel}</div>
                    <div className="text-xs text-slate-500">
                      {formatTime(t.startedAt)} · {t.durationMin} min · {t.distanceKm} km
                    </div>
                  </div>
                  <ExposureBadge level={level} />
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
