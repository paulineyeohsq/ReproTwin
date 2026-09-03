import { NavigateClient } from "@/components/navigate/NavigateClient";
import { getCurrentEnvironmentalReading } from "@/lib/environmentalDataProvider";
import { MAP_CENTER } from "@/lib/constants";

export default async function NavigatePage() {
  const initialReading = await getCurrentEnvironmentalReading(MAP_CENTER[0], MAP_CENTER[1]);

  return <NavigateClient initialReading={initialReading} />;
}
