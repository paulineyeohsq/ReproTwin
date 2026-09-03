import { CsvUploader } from "@/components/data/CsvUploader";
import { CSV_SCHEMAS } from "@/lib/csvSchemas";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import Link from "next/link";
import { getDataModeStatus } from "@/lib/dataMode";
import { loadRealEnvironmentData, loadRealMobilityData } from "@/lib/realDataAdapter";
import { getEffectiveMode, getRealDataSummary, getDataQuality, getDataProvenance } from "@/lib/dataAccess";
import { Database, FlaskConical, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/cn";

const SOURCES = [
  { label: "GPS / mobility", value: "Browser Geolocation / Synthetic Demo" },
  { label: "Environmental", value: "Synthetic Demo Data" },
  { label: "Physiological", value: "Synthetic Wearable-Style Data" },
  { label: "AI model", value: "Synthetic training data" },
];

function qualityRow(label: string, ok: boolean | null, detail?: string) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 py-2 text-sm last:border-0">
      <span className="text-slate-600">{label}</span>
      <span
        className={cn(
          "flex items-center gap-1.5 font-medium",
          ok === null ? "text-slate-400" : ok ? "text-emerald-600" : "text-rose-600"
        )}
      >
        {ok === null ? (
          detail ?? "—"
        ) : ok ? (
          <>
            <CheckCircle2 className="h-3.5 w-3.5" /> {detail ?? "Loaded"}
          </>
        ) : (
          <>
            <XCircle className="h-3.5 w-3.5" /> {detail ?? "Not loaded"}
          </>
        )}
      </span>
    </div>
  );
}

export default function DataPage() {
  const { hasRealEnvironmentData, hasRealMobilityData } = getDataModeStatus();
  const realEnv = loadRealEnvironmentData();
  const realMobility = loadRealMobilityData();
  const effectiveMode = getEffectiveMode();
  const realSummary = getRealDataSummary();
  const quality = getDataQuality();
  const provenance = getDataProvenance();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Data
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Import your own CSV data, load real Malaysian datasets, and see
          exactly what powers this prototype today.
        </p>
      </div>

      <Card>
        <CardHeader
          title="Real Malaysian data sources"
          subtitle="REAL DATA MODE vs DEMO MODE"
          action={
            effectiveMode === "real" ? (
              <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700">
                <Database className="h-3 w-3" /> Real data mode
              </Badge>
            ) : (
              <Badge className="border-amber-200 bg-amber-50 text-amber-700">
                <FlaskConical className="h-3 w-3" /> Demo mode
              </Badge>
            )
          }
        />
        <CardBody className="space-y-4">
          <p className="text-sm text-slate-600">
            This prototype prioritises real Malaysian data where possible.
            Environmental readings can come from the{" "}
            <span className="font-medium">Malaysian OpenDOSM / data.gov.my</span>{" "}
            air-pollution datasets (monitoring location, timestamp, PM2.5,
            PM10, NO2, SO2, O3, CO), and mobility traces can come from{" "}
            <span className="font-medium">real-world urban mobility trajectory data</span>{" "}
            such as the Greater Kuala Lumpur Mobilities dataset. When direct
            API access isn&apos;t available, a local adapter loads CSV files
            instead — drop files into{" "}
            <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">
              data/real/environment/
            </code>{" "}
            and{" "}
            <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">
              data/real/mobility/
            </code>{" "}
            and reload. Both are required together — exposure can only be
            calculated by matching a real trajectory against real pollutant
            readings, so having only one of the two keeps the app in demo
            mode.
          </p>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-slate-200 p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Environmental (data.gov.my / OpenDOSM)
              </div>
              {hasRealEnvironmentData ? (
                <div className="mt-1 text-sm text-slate-700">
                  {realEnv.fileCount} file(s), {realEnv.rows.length.toLocaleString()} records
                  {realEnv.dateRange && (
                    <div className="text-xs text-slate-500">
                      {realEnv.dateRange.start.slice(0, 10)} → {realEnv.dateRange.end.slice(0, 10)}
                    </div>
                  )}
                </div>
              ) : (
                <div className="mt-1 text-sm text-slate-400">
                  No real environmental CSV files detected — using synthetic data.
                </div>
              )}
            </div>
            <div className="rounded-lg border border-slate-200 p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Mobility (real-world GPS trajectories)
              </div>
              {hasRealMobilityData ? (
                <div className="mt-1 text-sm text-slate-700">
                  {realMobility.fileCount} file(s), {realMobility.rows.length.toLocaleString()} records
                  {realMobility.dateRange && (
                    <div className="text-xs text-slate-500">
                      {realMobility.dateRange.start.slice(0, 10)} → {realMobility.dateRange.end.slice(0, 10)}
                    </div>
                  )}
                </div>
              ) : (
                <div className="mt-1 text-sm text-slate-400">
                  No real mobility CSV files detected — using synthetic data.
                </div>
              )}
            </div>
          </div>

          {realSummary && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                Now driving the app
              </div>
              <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div>
                  <div className="text-lg font-semibold text-slate-800">{realSummary.tripCount}</div>
                  <div className="text-xs text-slate-500">Reconstructed trajectories</div>
                </div>
                <div>
                  <div className="text-lg font-semibold text-slate-800">{realSummary.totalDistanceKm} km</div>
                  <div className="text-xs text-slate-500">Total distance</div>
                </div>
                <div>
                  <div className="text-lg font-semibold text-slate-800">{realSummary.avgTripDurationMin} min</div>
                  <div className="text-xs text-slate-500">Avg trip duration</div>
                </div>
                <div>
                  <div className="text-lg font-semibold text-slate-800">{realSummary.avgSpeedKmh} km/h</div>
                  <div className="text-xs text-slate-500">Avg speed</div>
                </div>
                <div>
                  <div className="text-lg font-semibold text-slate-800">{realSummary.stationsRepresented.length}</div>
                  <div className="text-xs text-slate-500">Monitoring stations</div>
                </div>
                <div>
                  <div className="truncate text-sm font-medium text-slate-800">
                    {realSummary.latestMeasurementTimestamp?.slice(0, 16).replace("T", " ") ?? "—"}
                  </div>
                  <div className="text-xs text-slate-500">Latest measurement</div>
                </div>
              </div>
              {realSummary.stationsRepresented.length > 0 && (
                <p className="mt-2 text-xs text-slate-500">
                  Stations: {realSummary.stationsRepresented.join(", ")}
                </p>
              )}
            </div>
          )}

          <p className="text-xs text-slate-400">
            Environment source: {provenance.environmentSource} · Mobility
            source: {provenance.mobilitySource}
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Data quality" subtitle="What could actually be verified from the loaded files" />
        <CardBody>
          {qualityRow("Environmental records", quality.environmentalLoaded, quality.environmentalLoaded ? `Loaded (${quality.environmentRecordCount.toLocaleString()})` : "Not loaded")}
          {qualityRow("GPS records", quality.gpsLoaded, quality.gpsLoaded ? `Loaded (${quality.mobilityRecordCount.toLocaleString()})` : "Not loaded")}
          {qualityRow(
            "Timestamp / station matching",
            quality.timestampMatchPct === null ? null : quality.timestampMatchPct > 0,
            quality.timestampMatchPct === null ? "N/A in demo mode" : `${quality.timestampMatchPct}% matched`
          )}
          {qualityRow(
            "Unmatched GPS points (no environmental record within range)",
            quality.missingPm25Pct === null ? null : quality.missingPm25Pct === 0,
            quality.missingPm25Pct === null ? "N/A in demo mode" : `${quality.missingPm25Pct}%`
          )}
          {qualityRow(
            "Environmental records with no locatable station",
            quality.unlocatedStationRecordCount === 0 ? true : null,
            quality.unlocatedStationRecordCount > 0
              ? `${quality.unlocatedStationRecordCount.toLocaleString()} records`
              : "None"
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Current prototype data sources"
          subtitle="Full transparency on what is real vs. synthetic in this version"
        />
        <CardBody>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {SOURCES.map((s) => (
              <div key={s.label}>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  {s.label}
                </dt>
                <dd className="mt-1 text-sm font-medium text-slate-700">
                  {s.value}
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-xs text-slate-500">
            Real-world validation and external wearable integration are
            planned for future research phases. See the{" "}
            <Link href="/privacy" className="underline hover:text-slate-700">
              privacy &amp; data governance
            </Link>{" "}
            page for how sensitive data would be handled.
          </p>
        </CardBody>
      </Card>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-slate-800">
          Import data
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {CSV_SCHEMAS.map((schema) => (
            <CsvUploader key={schema.key} schema={schema} />
          ))}
        </div>
      </div>
    </div>
  );
}
