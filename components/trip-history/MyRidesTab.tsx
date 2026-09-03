"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { getAllTrips, type RecordedTrip } from "@/lib/tripStore";
import { Navigation } from "lucide-react";

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-MY", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kuala_Lumpur",
  });
}

export function MyRidesTab() {
  const [trips, setTrips] = useState<RecordedTrip[] | null>(null);

  useEffect(() => {
    getAllTrips()
      .then(setTrips)
      .catch(() => setTrips([]));
  }, []);

  return (
    <Card>
      <CardHeader
        title="My recorded rides"
        subtitle="Rides you've actually taken with real device GPS via the Navigate page — stored locally in this browser"
      />
      <CardBody className="overflow-x-auto p-0">
        {trips === null && <p className="p-5 text-sm text-slate-400">Loading…</p>}
        {trips !== null && trips.length === 0 && (
          <div className="p-5 text-sm text-slate-500">
            No recorded rides yet.{" "}
            <Link href="/navigate" className="text-[var(--brand-dark)] underline">
              Start a ride on the Navigate page
            </Link>{" "}
            to record one.
          </div>
        )}
        {trips !== null && trips.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="py-2 pl-5 pr-3">Started</th>
                <th className="py-2 pr-3">Destination</th>
                <th className="py-2 pr-3">Route</th>
                <th className="py-2 pr-3">Distance</th>
                <th className="py-2 pr-3">Duration</th>
                <th className="py-2 pr-5">Est. exposure</th>
              </tr>
            </thead>
            <tbody>
              {trips.map((t) => (
                <tr key={t.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="py-2.5 pl-5 pr-3 text-slate-600">{formatDateTime(t.startedAt)}</td>
                  <td className="py-2.5 pr-3 font-medium text-slate-800">
                    <Link href={`/trip-details/${t.id}`} className="flex items-center gap-1.5 hover:underline">
                      <Navigation className="h-3 w-3 text-slate-400" /> {t.destinationLabel}
                    </Link>
                  </td>
                  <td className="py-2.5 pr-3 text-slate-600">{t.selectedRoute.label}</td>
                  <td className="py-2.5 pr-3 text-slate-600">{t.distanceKm} km</td>
                  <td className="py-2.5 pr-3 text-slate-600">{t.durationMin} min</td>
                  <td className="py-2.5 pr-5 text-slate-600">{t.estimatedExposure}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardBody>
    </Card>
  );
}
