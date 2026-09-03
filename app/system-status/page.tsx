import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EnvironmentalModeBadge } from "@/components/ui/EnvironmentalModeBadge";
import { getDataProvenance, getDataQuality, getRealDataSummary } from "@/lib/dataAccess";
import { getModelMetrics } from "@/lib/aiModel";
import { getDataModeStatus } from "@/lib/dataMode";
import { getEnvironmentalMode } from "@/lib/environmentalDataProvider";
import { isLiveEnvironmentConfigured } from "@/lib/liveEnvironment";
import { isOpenDosmReachable } from "@/lib/historicalOpenDosm";
import { CheckCircle2, XCircle, Info } from "lucide-react";
import { cn } from "@/lib/cn";

function statusRow(label: string, ok: boolean | null, detail: string) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 py-2 text-sm last:border-0">
      <span className="text-slate-600">{label}</span>
      <span
        className={cn(
          "flex items-center gap-1.5 font-medium",
          ok === null ? "text-slate-400" : ok ? "text-emerald-600" : "text-rose-600"
        )}
      >
        {ok === null ? null : ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
        {detail}
      </span>
    </div>
  );
}

export default async function SystemStatusPage() {
  const provenance = getDataProvenance();
  const quality = getDataQuality();
  const realSummary = getRealDataSummary();
  const { hasRealEnvironmentData, hasRealMobilityData } = getDataModeStatus();
  const metrics = getModelMetrics();
  const environmentalMode = getEnvironmentalMode();
  const liveConfigured = isLiveEnvironmentConfigured();
  const openDosmReachable = await isOpenDosmReachable();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">System Status</h1>
        <p className="mt-1 text-sm text-slate-500">
          Data sources, API health, GPS status and model performance — for research/technical
          evaluation, not driver-facing.
        </p>
      </div>

      <Card>
        <CardHeader
          title="Mode"
          action={
            <Badge className={provenance.mode === "real" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"}>
              {provenance.mode === "real" ? "Real data mode" : "Demo mode"}
            </Badge>
          }
        />
        <CardBody>
          {statusRow("Mobility data source", true, provenance.mobilitySource)}
          {statusRow("Physiological data source", true, provenance.physiologySource)}
          {statusRow("Routing engine", true, "OpenStreetMap road network via OSRM (public demo instance)")}
          {statusRow("Geocoding", true, "OpenStreetMap Nominatim (public instance)")}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Environmental data modes"
          subtitle="MODE A (historical) / MODE B (live) / MODE C (synthetic) — see README.md for the DOE/JAS + OpenDOSM investigation this is based on"
          action={<EnvironmentalModeBadge mode={environmentalMode} />}
        />
        <CardBody>
          {statusRow(
            "MODE B — Live (DOE/JAS via WAQI aggregator)",
            liveConfigured,
            liveConfigured ? "WAQI_TOKEN configured" : "Not configured — no official DOE/JAS public developer API was found during investigation; see README.md"
          )}
          {statusRow(
            "MODE A — Historical, station-level (researcher-supplied DOE/JAS CSV)",
            hasRealEnvironmentData,
            hasRealEnvironmentData ? `Loaded — ${quality.environmentRecordCount.toLocaleString()} records` : "No CSV loaded — see data/real/environment/README.md"
          )}
          {statusRow(
            "MODE A — Historical, national (OpenDOSM auto-fetch)",
            openDosmReachable,
            openDosmReachable ? "Reachable — storage.data.gov.my (CC BY 4.0)" : "Unreachable this session"
          )}
          {statusRow(
            "Stations with no locatable coordinates",
            quality.unlocatedStationRecordCount === 0,
            `${quality.unlocatedStationRecordCount.toLocaleString()} records`
          )}
          {statusRow("MODE C — Synthetic demonstration data", true, "Always available as the final fallback")}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="GPS / mobility data" />
        <CardBody>
          {statusRow("Real mobility CSVs detected", hasRealMobilityData, hasRealMobilityData ? "Yes" : "No — using synthetic data")}
          {statusRow("Mobility records loaded", quality.gpsLoaded, quality.mobilityRecordCount ? `${quality.mobilityRecordCount.toLocaleString()} records` : "0")}
          {statusRow(
            "Timestamp / station matching",
            quality.timestampMatchPct === null ? null : quality.timestampMatchPct > 90,
            quality.timestampMatchPct === null ? "N/A in demo mode" : `${quality.timestampMatchPct}% matched`
          )}
          {realSummary && statusRow("Real trajectories reconstructed", realSummary.tripCount > 0, `${realSummary.tripCount}`)}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Exposure prediction model" />
        <CardBody>
          {statusRow("Model status", true, "Trained on demonstration data; real-world validation pending")}
          {statusRow("Held-out MAE", true, `${metrics.mae}`)}
          {statusRow("Held-out RMSE", true, `${metrics.rmse}`)}
          {statusRow("Held-out R²", true, `${metrics.r2}`)}
          {statusRow("Training samples", true, `${metrics.nTrain.toLocaleString()} train / ${metrics.nTest.toLocaleString()} test`)}
        </CardBody>
      </Card>

      <Card>
        <CardBody className="flex items-start gap-2 text-xs text-slate-500">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
          <p>
            Route-generation latency and geocoding latency are measured live and shown inline where
            they occur (the Navigate page&apos;s route comparison card, and browser dev tools network
            timing) rather than aggregated here yet — see the TRL-7 readiness notes for what a fuller
            validation dashboard (success-rate tracking across many real rides) would require.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
