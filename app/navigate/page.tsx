import { NavigateClient } from "@/components/navigate/NavigateClient";
import { getDashboardSnapshot, getDataProvenance } from "@/lib/dataAccess";

export default function NavigatePage() {
  const snapshot = getDashboardSnapshot();
  const provenance = getDataProvenance();

  return (
    <NavigateClient
      currentPm25={snapshot.currentPm25}
      currentPm25AsOf={snapshot.asOfDate}
      provenance={provenance}
    />
  );
}
