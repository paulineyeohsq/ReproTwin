"use client";

import Link from "next/link";
import { useRiderProfile } from "@/lib/profileStore";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { UserRound } from "lucide-react";
import { formatExposureValue } from "@/lib/format";

export function RiderSummaryCard({ ninetyDayExposure }: { ninetyDayExposure: number | null }) {
  const [profile] = useRiderProfile();

  return (
    <Card>
      <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--brand)]/10 text-[var(--brand-dark)]">
            <UserRound className="h-5 w-5" />
          </span>
          <div>
            <div className="text-sm font-semibold text-slate-900">
              {profile.rider_id} · {profile.display_name}
            </div>
            <div className="text-xs text-slate-500">
              {profile.age} years · {profile.sex} · {profile.motorcycle_type}{" "}
              {profile.engine_cc} cc
            </div>
            <div className="text-xs text-slate-500">
              Average riding: {profile.average_riding_hours} h/day · 90-day
              exposure: {formatExposureValue(ninetyDayExposure)}
              {ninetyDayExposure !== null && " units"}
            </div>
          </div>
        </div>
        <Link href="/profile" className="shrink-0">
          <Button size="sm" variant="outline">
            View Rider Profile
          </Button>
        </Link>
      </CardBody>
    </Card>
  );
}
