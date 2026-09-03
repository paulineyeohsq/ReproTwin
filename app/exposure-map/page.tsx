import { ExposureMapClient } from "@/components/exposuremap/ExposureMapClient";
import { getHotspots, getDataProvenance } from "@/lib/dataAccess";

export default function ExposureMapPage() {
  const hotspots = getHotspots();
  const provenance = getDataProvenance();
  return <ExposureMapClient hotspots={hotspots} provenance={provenance} />;
}
