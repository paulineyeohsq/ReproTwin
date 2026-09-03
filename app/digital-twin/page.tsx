import {
  getDigitalTwinStats,
  getPhysiologySeries,
  getDashboardSnapshot,
  getEnvironmentalSummary,
  getMobilitySummary,
  get90DayTimeline,
  getHotspots,
  getDataProvenance,
} from "@/lib/dataAccess";
import { formatExposureValue, INSUFFICIENT_DATA_NOTE } from "@/lib/format";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { StatTile } from "@/components/ui/StatTile";
import { Badge } from "@/components/ui/Badge";
import { SourceBadge } from "@/components/ui/SourceBadge";
import { PhysiologyTrendChart } from "@/components/charts/PhysiologyTrendChart";
import { NinetyDayTimelineChart } from "@/components/charts/NinetyDayTimelineChart";
import { RiderSummaryCard } from "@/components/dashboard/RiderSummaryCard";
import {
  Timer,
  Gauge,
  Clock,
  Route as RouteIcon,
  TrendingUp,
  TrendingDown,
  Minus,
  Wind,
  MapPin,
} from "lucide-react";
import { cn } from "@/lib/cn";

function TrendIcon({ direction }: { direction: "Increasing" | "Stable" | "Decreasing" }) {
  if (direction === "Increasing") return <TrendingUp className="h-3.5 w-3.5" />;
  if (direction === "Decreasing") return <TrendingDown className="h-3.5 w-3.5" />;
  return <Minus className="h-3.5 w-3.5" />;
}

const TREND_COLOR: Record<string, string> = {
  Increasing: "text-rose-600 bg-rose-50 border-rose-200",
  Decreasing: "text-emerald-600 bg-emerald-50 border-emerald-200",
  Stable: "text-slate-600 bg-slate-50 border-slate-200",
  "Insufficient data": "text-slate-500 bg-slate-50 border-slate-200",
};

export default function DigitalTwinPage() {
  const twin = getDigitalTwinStats();
  const physiology = getPhysiologySeries(90);
  const snapshot = getDashboardSnapshot();
  const environment = getEnvironmentalSummary(30);
  const mobility = getMobilitySummary();
  const timeline = get90DayTimeline();
  const hotspots = getHotspots();
  const provenance = getDataProvenance();
  const isReal = provenance.mode === "real";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          My Environmental Digital Twin
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          A dynamic computational profile — updates as new rides are
          recorded.
        </p>
      </div>

      <RiderSummaryCard ninetyDayExposure={snapshot.ninetyDayExposure} />

      {/* Exposure */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800">Exposure state</h2>
          <SourceBadge source={provenance.environmentSource} />
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="Today" value={snapshot.todaysExposure} unit="units" hint="Estimated exposure" />
          <StatTile
            label="7 days"
            value={formatExposureValue(twin.sevenDayExposure)}
            unit={twin.sevenDayExposure === null ? undefined : "units"}
            hint={twin.sevenDayExposure === null ? INSUFFICIENT_DATA_NOTE : "Estimated exposure"}
          />
          <StatTile
            label="30 days"
            value={formatExposureValue(twin.thirtyDayExposure)}
            unit={twin.thirtyDayExposure === null ? undefined : "units"}
            hint={twin.thirtyDayExposure === null ? INSUFFICIENT_DATA_NOTE : "Estimated exposure"}
          />
          <StatTile
            label="90 days"
            value={formatExposureValue(twin.ninetyDayExposure)}
            unit={twin.ninetyDayExposure === null ? undefined : "units"}
            hint={
              twin.ninetyDayExposure === null ? (
                INSUFFICIENT_DATA_NOTE
              ) : twin.ninetyDayLevel ? (
                <Badge className={TREND_COLOR.Stable}>{twin.ninetyDayLevel}</Badge>
              ) : undefined
            }
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Average riding"
          value={twin.avgRidingHoursPerDay}
          unit="h/day"
          icon={<Timer className="h-4 w-4 text-slate-400" />}
        />
        <StatTile
          label="Typical high-exposure period"
          value={twin.typicalHighExposureWindow}
          icon={<Clock className="h-4 w-4 text-slate-400" />}
        />
        <StatTile
          label="Typical high-exposure road"
          value={twin.typicalHighExposureRoad}
          icon={<RouteIcon className="h-4 w-4 text-slate-400" />}
        />
        <StatTile
          label="Exposure trend"
          value={twin.exposureTrend}
          icon={<Gauge className="h-4 w-4 text-slate-400" />}
          hint={twin.exposureTrend === "Insufficient data" ? undefined : "Last 30 days vs previous 30"}
        />
      </div>

      {/* Mobility */}
      <Card>
        <CardHeader
          title="Mobility state"
          subtitle={isReal ? "Derived from real GPS trajectory history" : "Derived from GPS trajectory history"}
          action={<SourceBadge source={provenance.mobilitySource} />}
        />
        <CardBody>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile
              label={isReal ? "Most recently observed route" : "Frequently travelled route"}
              value={mobility.frequentRoute}
              icon={<RouteIcon className="h-4 w-4 text-slate-400" />}
            />
            <StatTile label="High-exposure route" value={mobility.highExposureRoute} icon={<Wind className="h-4 w-4 text-slate-400" />} />
            <StatTile label="Average riding distance" value={mobility.avgTripDistanceKm} unit="km/trip" />
            <StatTile label="Average speed" value={mobility.avgSpeedKmh} unit="km/h" />
          </div>
        </CardBody>
      </Card>

      {/* Environmental exposure */}
      <Card>
        <CardHeader
          title="Environmental state"
          subtitle="30-day average conditions during rides"
          action={<SourceBadge source={provenance.environmentSource} />}
        />
        <CardBody className="space-y-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label="PM2.5" value={environment.avgPm25} unit="µg/m³" />
            <StatTile label="PM10" value={environment.avgPm10} unit="µg/m³" />
            <StatTile label="NO2" value={environment.avgNo2} unit="ppb" />
            <StatTile label="Exposure hotspots" value={hotspots.length} unit="tracked" icon={<MapPin className="h-4 w-4 text-slate-400" />} />
          </div>
          <p className="text-xs text-slate-400">
            See Trip History → Exposure hotspots for the map view.
          </p>
        </CardBody>
      </Card>

      {/* 90-day timeline */}
      <Card>
        <CardHeader
          title="90-day exposure timeline"
          subtitle="Sperm-development-relevant exposure window"
        />
        <CardBody className="space-y-4">
          <NinetyDayTimelineChart series={timeline.series} />
          {isReal && timeline.daysCovered < 90 && (
            <p className="text-xs text-amber-600">
              Based on {timeline.daysCovered} day{timeline.daysCovered === 1 ? "" : "s"} of currently
              available real data, not the full 90-day window.
            </p>
          )}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatTile
              label="Cumulative PM2.5 exposure"
              value={formatExposureValue(twin.ninetyDayExposure)}
              unit={twin.ninetyDayExposure === null ? undefined : "units"}
            />
            <StatTile label="High-exposure trips" value={timeline.highExposureTripCount} />
            <StatTile label="High-exposure days" value={timeline.highExposureDayCount} />
          </div>
          <p className="text-sm leading-relaxed text-slate-600">
            The 90-day exposure window is included because sperm development
            occurs over approximately this timescale. This prototype does
            not predict fertility or semen quality — it monitors cumulative
            environmental exposure only, as reproductive-health-relevant
            context.
          </p>
        </CardBody>
      </Card>

      {/* Physiological context */}
      <Card>
        <CardHeader
          title="Physiological context"
          subtitle="90-day trends — demonstration data only, not medical biomarkers"
          action={<SourceBadge source={provenance.physiologySource} />}
        />
        <CardBody className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-lg bg-slate-50 p-3">
              <div className="text-xs font-medium text-slate-500">Resting HR</div>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-lg font-semibold text-slate-800">
                  {twin.hrTrend.current} bpm
                </span>
                <Badge className={TREND_COLOR[twin.hrTrend.direction]}>
                  <TrendIcon direction={twin.hrTrend.direction} />
                  {twin.hrTrend.direction}
                </Badge>
              </div>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <div className="text-xs font-medium text-slate-500">HRV</div>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-lg font-semibold text-slate-800">
                  {twin.hrvTrend.current} ms
                </span>
                <Badge className={TREND_COLOR[twin.hrvTrend.direction]}>
                  <TrendIcon direction={twin.hrvTrend.direction} />
                  {twin.hrvTrend.direction}
                </Badge>
              </div>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <div className="text-xs font-medium text-slate-500">Sleep</div>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-lg font-semibold text-slate-800">
                  {twin.sleepTrend.current} h
                </span>
                <Badge className={TREND_COLOR[twin.sleepTrend.direction]}>
                  <TrendIcon direction={twin.sleepTrend.direction} />
                  {twin.sleepTrend.direction}
                </Badge>
              </div>
            </div>
          </div>
          <PhysiologyTrendChart data={physiology} />
          <p className="text-xs text-slate-400">
            Physiological variables are included as contextual information in
            the digital twin and are not used to diagnose disease or predict
            fertility.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
