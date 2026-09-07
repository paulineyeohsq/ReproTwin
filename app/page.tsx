import { NavigateClient } from "@/components/navigate/NavigateClient";
import { getCurrentEnvironmentalReading } from "@/lib/environmentalDataProvider";
import { MAP_CENTER } from "@/lib/constants";

// Without this, a statically-optimized build (Netlify/Vercel) would fetch
// the "current conditions" reading once at build time and freeze it there
// forever — 5 minutes matches the live-provider fetches' own cache window
// (see lib/liveEnvironment.ts / lib/livePurpleAir.ts / lib/liveOpenAQ.ts).
export const revalidate = 300;

export default async function HomePage() {
  const initialReading = await getCurrentEnvironmentalReading(MAP_CENTER[0], MAP_CENTER[1]);

  return <NavigateClient initialReading={initialReading} />;
}
