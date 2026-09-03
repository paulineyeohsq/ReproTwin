import {
  getDashboardSnapshot,
  getDailyAggregates,
  getLatestPhysiology,
  getRecommendationInputs,
  getDataProvenance,
} from "@/lib/dataAccess";
import { getCurrentEnvironmentalReading } from "@/lib/environmentalDataProvider";
import { PROJECT_TAGLINE, RIDER, ORIGIN_LABEL, DESTINATIONS, MAP_CENTER } from "@/lib/constants";
import { formatExposureValue } from "@/lib/format";
import { classifyPm25 } from "@/lib/exposure";
import { EnvironmentalModeBadge } from "@/components/ui/EnvironmentalModeBadge";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { StatTile } from "@/components/ui/StatTile";
import { ExposureBadge } from "@/components/ui/Badge";
import { SourceBadge } from "@/components/ui/SourceBadge";
import { FreshnessLabel } from "@/components/ui/FreshnessLabel";
import { WorkflowStrip } from "@/components/ui/WorkflowStrip";
import { ExposureTrendChart } from "@/components/charts/ExposureTrendChart";
import { RecommendationsPanel } from "@/components/dashboard/RecommendationsPanel";
import { RiderSummaryCard } from "@/components/dashboard/RiderSummaryCard";
import { RouteRecommendationPreview } from "@/components/dashboard/RouteRecommendationPreview";
import { Button } from "@/components/ui/Button";
import Link from "next/link";
import {
  Wind,
  Timer,
  Gauge,
  CalendarRange,
  HeartPulse,
  Moon,
  Footprints,
  Activity,
  MapPin,
  Navigation,
} from "lucide-react";

export default async function DashboardPage() {
  const snapshot = getDashboardSnapshot();
  const daily = getDailyAggregates();
  const physio = getLatestPhysiology();
  const recInputs = getRecommendationInputs();
  const provenance = getDataProvenance();
  const currentReading = await getCurrentEnvironmentalReading(MAP_CENTER[0], MAP_CENTER[1]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--brand-dark)]">
            Exposure-Aware Navigation
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
            Find routes that balance travel time and air-pollution exposure
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">{PROJECT_TAGLINE}</p>
        </div>
        <Link href="/navigate" className="shrink-0">
          <Button>
            <Navigation className="h-4 w-4" /> Navigate now
          </Button>
        </Link>
      </div>

      <WorkflowStrip />

      <RiderSummaryCard ninetyDayExposure={snapshot.ninetyDayExposure} />

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800">Current status</h2>
          <EnvironmentalModeBadge mode={currentReading.mode} />
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <StatTile
            label="Current location"
            value={ORIGIN_LABEL}
            unit={RIDER.city.split(",")[0]}
            icon={<MapPin className="h-4 w-4 text-slate-400" />}
          />
          <StatTile
            label="Current PM2.5"
            value={currentReading.pm25 ?? "—"}
            unit="µg/m³"
            icon={<Wind className="h-4 w-4 text-slate-400" />}
            hint={currentReading.pm25 !== null ? <ExposureBadge level={classifyPm25(currentReading.pm25)} /> : "Unavailable"}
          />
          <StatTile
            label="Today's riding"
            value={snapshot.todaysRidingHours}
            unit="hours"
            icon={<Timer className="h-4 w-4 text-slate-400" />}
            hint={`As of ${snapshot.asOfDate}`}
          />
          <StatTile
            label="Today's exposure"
            value={snapshot.todaysExposure}
            unit="units"
            icon={<Gauge className="h-4 w-4 text-slate-400" />}
            hint="Estimated exposure — prototype index"
          />
          <StatTile
            label="90-day exposure"
            value={formatExposureValue(snapshot.ninetyDayExposure)}
            unit={snapshot.ninetyDayExposure === null ? undefined : "units"}
            icon={<CalendarRange className="h-4 w-4 text-slate-400" />}
            hint={
              snapshot.ninetyDayExposure === null
                ? "Insufficient real data for this window"
                : "Cumulative, rolling window"
            }
          />
        </div>
        <div className="mt-3 max-w-md">
          <FreshnessLabel reading={currentReading} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Exposure trend"
            subtitle="Daily estimated exposure and riding hours"
          />
          <CardBody>
            <ExposureTrendChart data={daily} />
          </CardBody>
        </Card>

        <RouteRecommendationPreview destination={DESTINATIONS[0]} />
      </div>

      <Card>
        <CardHeader
          title="Personalised recommendations"
          subtitle="Deterministic, rule-based exposure-management guidance — not medical or fertility advice"
        />
        <CardBody>
          <RecommendationsPanel baseInputs={recInputs} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Physiological context (research/future functionality)"
          subtitle="Not part of the core exposure-aware navigation flow. Demonstration data only — not interpreted as fertility or medical biomarkers."
          action={<SourceBadge source={provenance.physiologySource} />}
        />
        <CardBody>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <StatTile
              label="Resting HR"
              value={physio.resting_hr}
              unit="bpm"
              icon={<HeartPulse className="h-4 w-4 text-slate-400" />}
            />
            <StatTile
              label="HRV"
              value={physio.hrv}
              unit="ms"
              icon={<Activity className="h-4 w-4 text-slate-400" />}
            />
            <StatTile
              label="Sleep"
              value={physio.sleep_duration}
              unit="h"
              icon={<Moon className="h-4 w-4 text-slate-400" />}
            />
            <StatTile
              label="SpO₂"
              value={physio.spo2}
              unit="%"
              icon={<Wind className="h-4 w-4 text-slate-400" />}
            />
            <StatTile
              label="Steps"
              value={physio.steps.toLocaleString()}
              icon={<Footprints className="h-4 w-4 text-slate-400" />}
            />
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
