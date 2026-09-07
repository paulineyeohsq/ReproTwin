import { ProfileTabs } from "@/components/profile/ProfileTabs";
import { RiderProfileClient } from "@/components/profile/RiderProfileClient";
import { TripHistoryClient } from "@/components/trip-history/TripHistoryClient";
import { ExposureMapClient } from "@/components/exposuremap/ExposureMapClient";
import { CurrentStatusSection } from "@/components/dashboard/CurrentStatusSection";
import { RouteRecommendationPreview } from "@/components/dashboard/RouteRecommendationPreview";
import { RecommendationsPanel } from "@/components/dashboard/RecommendationsPanel";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { ExposureTrendChart } from "@/components/charts/ExposureTrendChart";
import {
  getDigitalTwinStats,
  getEnvironmentalSummary,
  getMobilitySummary,
  getLatestPhysiology,
  getPhysiologySeries,
  getDataProvenance,
  getDashboardSnapshot,
  getDailyAggregates,
  getRecommendationInputs,
  getTripHistorySummaries,
  getRealStations,
  getHotspots,
} from "@/lib/dataAccess";
import { getCurrentEnvironmentalReading } from "@/lib/environmentalDataProvider";
import { fetchWaqiHistoricalAverage, isLiveEnvironmentConfigured, type WaqiHistoricalAverage } from "@/lib/liveEnvironment";
import { DESTINATIONS, MAP_CENTER, POPULAR_DESTINATIONS } from "@/lib/constants";
import type { EnvironmentalReading } from "@/lib/types";

// Rider Profile absorbed Dashboard's stats/trend/recommendations, Trip
// History, and the Exposure Map into one tabbed page — several of those
// tabs show live readings that must not freeze at build time on a
// statically-optimized deploy (see app/page.tsx for the same reasoning).
export const revalidate = 300;

export default async function RiderProfilePage() {
  // Profile tab
  const twin = getDigitalTwinStats();
  const environment = getEnvironmentalSummary(30);
  const mobility = getMobilitySummary();
  const physioLatest = getLatestPhysiology();
  const physioSeries = getPhysiologySeries(30);
  const provenance = getDataProvenance();
  const avgSteps = Math.round(physioSeries.reduce((s, p) => s + p.steps, 0) / physioSeries.length);

  // Overview tab
  const snapshot = getDashboardSnapshot();
  const daily = getDailyAggregates();
  const recInputs = getRecommendationInputs();
  const currentReading = await getCurrentEnvironmentalReading(MAP_CENTER[0], MAP_CENTER[1]);
  const previewDestination = POPULAR_DESTINATIONS.find((d) => d.label === DESTINATIONS[0])!;

  // Trip History tab
  const trips = getTripHistorySummaries(20);
  const stations = getRealStations();

  // Exposure Map tab
  const hotspots = getHotspots();
  const liveEntries = await Promise.all(
    hotspots.map(async (h) => [h.id, await getCurrentEnvironmentalReading(h.latitude, h.longitude)] as const)
  );
  const liveReadings: Record<string, EnvironmentalReading> = Object.fromEntries(liveEntries);
  let waqiHistoricals: Record<string, WaqiHistoricalAverage> = {};
  if (isLiveEnvironmentConfigured()) {
    const entries = await Promise.all(
      hotspots.map(async (h) => [h.id, await fetchWaqiHistoricalAverage(h.latitude, h.longitude)] as const)
    );
    waqiHistoricals = Object.fromEntries(entries.filter((e): e is [string, WaqiHistoricalAverage] => e[1] !== null));
  }

  return (
    <ProfileTabs
      overview={
        <div className="space-y-6">
          <CurrentStatusSection
            initialReading={currentReading}
            lat={MAP_CENTER[0]}
            lng={MAP_CENTER[1]}
            todaysRidingHours={snapshot.todaysRidingHours}
            todaysExposure={snapshot.todaysExposure}
            ninetyDayExposure={snapshot.ninetyDayExposure}
            asOfDate={snapshot.asOfDate}
          />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader title="Exposure trend" subtitle="Daily estimated exposure and riding hours" />
              <CardBody>
                <ExposureTrendChart data={daily} />
              </CardBody>
            </Card>
            <RouteRecommendationPreview destination={previewDestination} />
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
        </div>
      }
      profileTab={
        <RiderProfileClient
          twin={twin}
          environment={environment}
          mobility={mobility}
          physioLatest={physioLatest}
          avgSteps={avgSteps}
          provenance={provenance}
        />
      }
      tripHistory={<TripHistoryClient trips={trips} provenance={provenance} stations={stations} />}
      exposureMap={
        <ExposureMapClient
          hotspots={hotspots}
          provenance={provenance}
          liveReadings={liveReadings}
          waqiHistoricals={waqiHistoricals}
        />
      }
    />
  );
}
