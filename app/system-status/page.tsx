import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EnvironmentalModeBadge } from "@/components/ui/EnvironmentalModeBadge";
import { getDataProvenance, getDataQuality, getRealDataSummary } from "@/lib/dataAccess";
import { getModelMetrics } from "@/lib/aiModel";
import { getDataModeStatus } from "@/lib/dataMode";
import { getEnvironmentalMode } from "@/lib/environmentalDataProvider";
import { isLiveEnvironmentConfigured } from "@/lib/liveEnvironment";
import { isPurpleAirConfigured } from "@/lib/livePurpleAir";
import { isOpenAqConfigured } from "@/lib/liveOpenAQ";
import { isOpenDosmReachable } from "@/lib/historicalOpenDosm";
import { getCollectionStatus } from "@/lib/historicalCollector";
import { CheckCircle2, XCircle, Info } from "lucide-react";
import { cn } from "@/lib/cn";

// See app/page.tsx for why this is needed on a statically-optimized build
// — this page reports live-mode status, which must not freeze at build time.
export const revalidate = 300;

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
  const openAqConfigured = isOpenAqConfigured();
  const purpleAirConfigured = isPurpleAirConfigured();
  const waqiConfigured = isLiveEnvironmentConfigured();
  const openDosmReachable = await isOpenDosmReachable();
  const collection = await getCollectionStatus();

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
            "MODE B — Live (OpenAQ aggregator)",
            openAqConfigured,
            openAqConfigured ? "OPENAQ_API_KEY configured — tried first" : "Not configured"
          )}
          {statusRow(
            "MODE B — Live (PurpleAir community sensors)",
            purpleAirConfigured,
            purpleAirConfigured ? "PURPLEAIR_API_KEY configured — fallback if OpenAQ unavailable" : "Not configured"
          )}
          {statusRow(
            "MODE B — Live (DOE/JAS via WAQI aggregator)",
            waqiConfigured,
            waqiConfigured ? "WAQI_TOKEN configured — last live fallback" : "Not configured — no official DOE/JAS public developer API was found during investigation; see README.md"
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
        <CardHeader
          title="Real historical data collection"
          subtitle="Accumulating real WAQI snapshots over time (Netlify Blobs), for a future model retrain on real ambient PM2.5 — see the exposure-model explanation in-chat for why this is separate from the exposure-prediction model itself"
        />
        <CardBody>
          {statusRow(
            "Storage",
            collection.available,
            collection.available ? "Netlify Blobs reachable" : "Unavailable in this environment (expected on local `next dev`)"
          )}
          {statusRow(
            "Snapshots collected",
            collection.snapshotCount > 0 ? true : null,
            collection.snapshotCount > 0 ? `${collection.snapshotCount.toLocaleString()}` : "0 — none collected yet"
          )}
          {collection.firstCollectedAt &&
            statusRow("First snapshot", true, new Date(collection.firstCollectedAt).toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur" }))}
          {collection.lastCollectedAt &&
            statusRow("Most recent snapshot", true, new Date(collection.lastCollectedAt).toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur" }))}
          {statusRow("Collection schedule", true, "Every 6 hours via GitHub Actions cron (.github/workflows/collect-environment-data.yml)")}
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
        <CardHeader
          title="Exposure prediction model"
          subtitle="The dose-rate model itself is trained on synthetic data only — that hasn't changed. What HAS changed: its PM2.5/PM10/NO2 inputs are now real (nearest live station, see Environmental data modes above) whenever one is configured, instead of always synthetic. The metrics below describe the model's fit to its synthetic training set, not real-world accuracy — they don't change when the model's real-world inputs do."
        />
        <CardBody>
          {statusRow("Model status", true, "Trained on demonstration data only; real-world validation pending")}
          {statusRow("Input data (this request)", environmentalMode !== "synthetic", environmentalMode === "synthetic" ? "Synthetic (no live/historical source configured)" : `Real when available (current mode: ${environmentalMode})`)}
          {statusRow("Held-out MAE", true, `${metrics.mae}`)}
          {statusRow("Held-out RMSE", true, `${metrics.rmse}`)}
          {statusRow("Held-out R²", true, `${metrics.r2}`)}
          {statusRow("Training samples", true, `${metrics.nTrain.toLocaleString()} train / ${metrics.nTest.toLocaleString()} test`)}
          {statusRow("Trained at", true, new Date(metrics.trainedAt).toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur" }))}
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
