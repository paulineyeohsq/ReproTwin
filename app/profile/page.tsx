import { RiderProfileClient } from "@/components/profile/RiderProfileClient";
import {
  getDigitalTwinStats,
  getEnvironmentalSummary,
  getMobilitySummary,
  getLatestPhysiology,
  getPhysiologySeries,
  getDataProvenance,
} from "@/lib/dataAccess";

export default function RiderProfilePage() {
  const twin = getDigitalTwinStats();
  const environment = getEnvironmentalSummary(30);
  const mobility = getMobilitySummary();
  const physioLatest = getLatestPhysiology();
  const physioSeries = getPhysiologySeries(30);
  const provenance = getDataProvenance();

  const avgSteps = Math.round(
    physioSeries.reduce((s, p) => s + p.steps, 0) / physioSeries.length
  );

  return (
    <RiderProfileClient
      twin={twin}
      environment={environment}
      mobility={mobility}
      physioLatest={physioLatest}
      avgSteps={avgSteps}
      provenance={provenance}
    />
  );
}
