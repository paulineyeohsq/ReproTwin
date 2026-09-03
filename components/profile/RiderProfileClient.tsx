"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatTile } from "@/components/ui/StatTile";
import { ExposureBadge } from "@/components/ui/Badge";
import { SourceBadge } from "@/components/ui/SourceBadge";
import { useRiderProfile } from "@/lib/profileStore";
import { MOTORCYCLE_TYPES, FUEL_TYPES, TRAVEL_PURPOSES } from "@/lib/constants";
import { formatExposureValue, INSUFFICIENT_DATA_NOTE } from "@/lib/format";
import type { RiderProfile, DataProvenance } from "@/lib/types";
import type {
  DigitalTwinStats,
  EnvironmentalSummary,
  MobilitySummary,
} from "@/lib/dataAccess";
import type { HealthRecord } from "@/lib/types";
import {
  UserRound,
  Bike,
  Gauge,
  HeartPulse,
  Pencil,
  Save,
  X,
  ShieldCheck,
  Radar,
} from "lucide-react";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
      {children}
    </label>
  );
}

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm disabled:border-transparent disabled:bg-slate-50 disabled:px-0 disabled:py-0.5 disabled:text-slate-800";
const selectClass = inputClass;

export function RiderProfileClient({
  twin,
  environment,
  mobility,
  physioLatest,
  avgSteps,
  provenance,
}: {
  twin: DigitalTwinStats;
  environment: EnvironmentalSummary;
  mobility: MobilitySummary;
  physioLatest: HealthRecord;
  avgSteps: number;
  provenance: DataProvenance;
}) {
  const [profile, setProfile, hydrated] = useRiderProfile();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<RiderProfile>(profile);

  useEffect(() => {
    if (!editing) setDraft(profile);
  }, [profile, editing]);

  function update<K extends keyof RiderProfile>(key: K, value: RiderProfile[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function save() {
    setProfile(draft);
    setEditing(false);
  }

  function cancel() {
    setDraft(profile);
    setEditing(false);
  }

  const avgDailyExposure =
    twin.sevenDayExposure === null ? null : Math.round((twin.sevenDayExposure / 7) * 10) / 10;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Rider Profile
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Who is being modelled by the environmental digital twin.
          </p>
        </div>
        {!editing ? (
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            <Pencil className="h-3.5 w-3.5" /> Edit Profile
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={cancel}>
              <X className="h-3.5 w-3.5" /> Cancel
            </Button>
            <Button size="sm" onClick={save}>
              <Save className="h-3.5 w-3.5" /> Save changes
            </Button>
          </div>
        )}
      </div>

      {!hydrated && (
        <p className="text-xs text-slate-400">Loading saved profile…</p>
      )}

      {/* A. Basic Information */}
      <Card>
        <CardHeader
          title="Basic information"
          subtitle="Fictional demo identity — no real personal data required"
          action={<UserRound className="h-4 w-4 text-slate-400" />}
        />
        <CardBody>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Field label="Rider ID">
              <input className={inputClass} value={draft.rider_id} disabled />
            </Field>
            <Field label="Display name">
              <input
                className={inputClass}
                value={draft.display_name}
                disabled={!editing}
                onChange={(e) => update("display_name", e.target.value)}
              />
            </Field>
            <Field label="Age">
              <input
                type="number"
                className={inputClass}
                value={draft.age}
                disabled={!editing}
                onChange={(e) => update("age", Number(e.target.value))}
              />
            </Field>
            <Field label="Sex">
              <select
                className={selectClass}
                value={draft.sex}
                disabled={!editing}
                onChange={(e) => update("sex", e.target.value as RiderProfile["sex"])}
              >
                <option>Male</option>
                <option>Female</option>
                <option>Prefer not to say</option>
              </select>
            </Field>
            <Field label="Height (cm)">
              <input
                type="number"
                className={inputClass}
                value={draft.height_cm}
                disabled={!editing}
                onChange={(e) => update("height_cm", Number(e.target.value))}
              />
            </Field>
            <Field label="Weight (kg)">
              <input
                type="number"
                className={inputClass}
                value={draft.weight_kg}
                disabled={!editing}
                onChange={(e) => update("weight_kg", Number(e.target.value))}
              />
            </Field>
            <Field label="Usual riding area">
              <input
                className={inputClass}
                value={draft.usual_area}
                disabled={!editing}
                onChange={(e) => update("usual_area", e.target.value)}
              />
            </Field>
          </div>
        </CardBody>
      </Card>

      {/* B. Motorcycle & Riding Profile */}
      <Card>
        <CardHeader
          title="Motorcycle & riding profile"
          subtitle="Rider-provided information"
          action={<Bike className="h-4 w-4 text-slate-400" />}
        />
        <CardBody>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Field label="Motorcycle type">
              <select
                className={selectClass}
                value={draft.motorcycle_type}
                disabled={!editing}
                onChange={(e) => update("motorcycle_type", e.target.value)}
              >
                {MOTORCYCLE_TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </Field>
            <Field label="Engine capacity (cc)">
              <input
                type="number"
                className={inputClass}
                value={draft.engine_cc}
                disabled={!editing}
                onChange={(e) => update("engine_cc", Number(e.target.value))}
              />
            </Field>
            <Field label="Fuel type">
              <select
                className={selectClass}
                value={draft.fuel_type}
                disabled={!editing}
                onChange={(e) => update("fuel_type", e.target.value)}
              >
                {FUEL_TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </Field>
            <Field label="Riding experience (years)">
              <input
                type="number"
                className={inputClass}
                value={draft.riding_experience_years}
                disabled={!editing}
                onChange={(e) => update("riding_experience_years", Number(e.target.value))}
              />
            </Field>
            <Field label="Self-reported riding (h/day)">
              <input
                type="number"
                step={0.1}
                className={inputClass}
                value={draft.average_riding_hours}
                disabled={!editing}
                onChange={(e) => update("average_riding_hours", Number(e.target.value))}
              />
            </Field>
            <Field label="Riding days/week">
              <input
                type="number"
                min={1}
                max={7}
                className={inputClass}
                value={draft.riding_days_per_week}
                disabled={!editing}
                onChange={(e) => update("riding_days_per_week", Number(e.target.value))}
              />
            </Field>
            <Field label="Self-reported trip distance (km)">
              <input
                type="number"
                className={inputClass}
                value={draft.average_trip_distance_km}
                disabled={!editing}
                onChange={(e) => update("average_trip_distance_km", Number(e.target.value))}
              />
            </Field>
            <Field label="Typical travel period">
              <input
                className={inputClass}
                value={draft.typical_travel_period}
                disabled={!editing}
                onChange={(e) => update("typical_travel_period", e.target.value)}
              />
            </Field>
            <Field label="Main riding purpose">
              <select
                className={selectClass}
                value={draft.primary_travel_purpose}
                disabled={!editing}
                onChange={(e) => update("primary_travel_purpose", e.target.value)}
              >
                {TRAVEL_PURPOSES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </Field>
          </div>
          <p className="mt-3 text-xs text-slate-400">
            These are the rider&apos;s own estimates. They never override the
            observed values calculated from actual mobility data below —
            compare them in the Environmental Exposure Profile section.
          </p>
        </CardBody>
      </Card>

      {/* Self-reported vs observed */}
      <Card>
        <CardHeader
          title="Self-reported vs. observed"
          subtitle="The rider's own estimate, next to what the mobility data actually show"
          action={<Radar className="h-4 w-4 text-slate-400" />}
        />
        <CardBody>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-slate-200 p-3">
              <div className="text-xs font-medium text-slate-500">Average trip distance</div>
              <div className="mt-2 flex items-baseline justify-between">
                <div>
                  <div className="text-lg font-semibold text-slate-800">
                    {draft.average_trip_distance_km} km
                  </div>
                  <div className="text-[11px] text-slate-400">Self-reported</div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-semibold text-[var(--brand-dark)]">
                    {mobility.avgTripDistanceKm} km/trip
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Observed — calculated from {provenance.mode === "real" ? "real" : "recorded"} mobility data
                  </div>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 p-3">
              <div className="text-xs font-medium text-slate-500">Average riding duration</div>
              <div className="mt-2 flex items-baseline justify-between">
                <div>
                  <div className="text-lg font-semibold text-slate-800">
                    {draft.average_riding_hours} h/day
                  </div>
                  <div className="text-[11px] text-slate-400">Self-reported</div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-semibold text-[var(--brand-dark)]">
                    {twin.avgRidingHoursPerDay} h/day
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Observed — calculated from {provenance.mode === "real" ? "real" : "recorded"} mobility data
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* C. Environmental Exposure Profile */}
      <Card>
        <CardHeader
          title="Environmental exposure profile"
          subtitle="Automatically calculated from the digital twin — self-reported values never override these"
          action={<Gauge className="h-4 w-4 text-slate-400" />}
        />
        <CardBody className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile
              label="Average daily exposure"
              value={formatExposureValue(avgDailyExposure)}
              unit={avgDailyExposure === null ? undefined : "units"}
              hint={avgDailyExposure === null ? INSUFFICIENT_DATA_NOTE : undefined}
            />
            <StatTile
              label="7-day exposure"
              value={formatExposureValue(twin.sevenDayExposure)}
              unit={twin.sevenDayExposure === null ? undefined : "units"}
              hint={twin.sevenDayExposure === null ? INSUFFICIENT_DATA_NOTE : undefined}
            />
            <StatTile
              label="30-day exposure"
              value={formatExposureValue(twin.thirtyDayExposure)}
              unit={twin.thirtyDayExposure === null ? undefined : "units"}
              hint={twin.thirtyDayExposure === null ? INSUFFICIENT_DATA_NOTE : undefined}
            />
            <StatTile
              label="90-day exposure"
              value={formatExposureValue(twin.ninetyDayExposure)}
              unit={twin.ninetyDayExposure === null ? undefined : "units"}
              hint={
                twin.ninetyDayExposure === null ? (
                  INSUFFICIENT_DATA_NOTE
                ) : twin.ninetyDayLevel ? (
                  <ExposureBadge level={twin.ninetyDayLevel} />
                ) : undefined
              }
            />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label="High-exposure trips" value={twin.highExposureTripCount} unit="in 90 days" />
            <StatTile label="Average riding" value={twin.avgRidingHoursPerDay} unit="h/day" hint="Observed" />
            <StatTile
              label="Average trip distance"
              value={mobility.avgTripDistanceKm}
              unit="km/trip"
              hint="Observed"
            />
            <StatTile label="Most frequent route" value={mobility.frequentRoute} />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label="Highest-exposure route" value={mobility.highExposureRoute} />
            <StatTile label="Most common exposure period" value={twin.typicalHighExposureWindow} />
            <StatTile label="Avg PM2.5 (30d)" value={environment.avgPm25} unit="µg/m³" />
            <StatTile label="Avg PM10 (30d)" value={environment.avgPm10} unit="µg/m³" />
          </div>
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-400">
              Exposure estimates are calculated from environmental conditions,
              riding duration and mobility patterns. Values are modelled
              estimates and are not clinical measurements.
            </p>
            <SourceBadge source={provenance.environmentSource} />
          </div>
        </CardBody>
      </Card>

      {/* D. Physiological Context */}
      <Card>
        <CardHeader
          title="Physiological context"
          action={<HeartPulse className="h-4 w-4 text-slate-400" />}
        />
        <CardBody className="space-y-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label="Resting HR" value={physioLatest.resting_hr} unit="bpm" />
            <StatTile label="Average riding HR" value={physioLatest.avg_hr} unit="bpm" />
            <StatTile label="HRV" value={physioLatest.hrv} unit="ms" />
            <StatTile label="SpO₂" value={physioLatest.spo2} unit="%" />
            <StatTile label="Respiratory rate" value={physioLatest.respiratory_rate} unit="/min" />
            <StatTile label="Average daily steps" value={avgSteps.toLocaleString()} />
            <StatTile label="Sleep" value={physioLatest.sleep_duration} unit="h/night" />
            <StatTile label="Sleep score" value={physioLatest.sleep_score} unit="/100" />
          </div>
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-400">
              Physiological variables are included as contextual information in
              the digital twin and are not used to diagnose disease or predict
              fertility.
            </p>
            <SourceBadge source={provenance.physiologySource} />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="flex items-start gap-2 text-xs text-slate-500">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
          <p>
            This prototype uses fictional/demo rider information. Real-world
            deployment would require appropriate consent, privacy safeguards
            and secure data management.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
