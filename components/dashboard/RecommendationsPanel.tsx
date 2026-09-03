"use client";

import { useMemo } from "react";
import { RecommendationsList } from "@/components/ui/RecommendationsList";
import { useRiderProfile } from "@/lib/profileStore";
import {
  getRecommendations,
  getProfileRecommendations,
  type RecommendationInputs,
} from "@/lib/recommendations";

export function RecommendationsPanel({ baseInputs }: { baseInputs: RecommendationInputs }) {
  const [profile] = useRiderProfile();

  const items = useMemo(() => {
    const base = getRecommendations(baseInputs);
    const profileRecs = getProfileRecommendations(profile);
    // De-dupe by id in case a base rule and a profile rule overlap in spirit.
    const seen = new Set(base.map((r) => r.id));
    const merged = [...base];
    for (const r of profileRecs) {
      if (!seen.has(r.id)) {
        merged.push(r);
        seen.add(r.id);
      }
    }
    return merged;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseInputs, profile]);

  return <RecommendationsList items={items} />;
}
