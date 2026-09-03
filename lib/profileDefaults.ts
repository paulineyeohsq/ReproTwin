import type { RiderProfile } from "./types";

// Default demo identity — fictional, not real personal data. Editable via
// the Rider Profile page and persisted to the browser's localStorage only.
export const DEFAULT_RIDER_PROFILE: RiderProfile = {
  rider_id: "R001",
  display_name: "Demo Rider",
  age: 29,
  sex: "Male",
  height_cm: 170,
  weight_kg: 68,
  usual_area: "Klang Valley, Malaysia",
  motorcycle_type: "Underbone",
  engine_cc: 150,
  fuel_type: "Petrol",
  riding_experience_years: 8,
  average_riding_hours: 2.5,
  riding_days_per_week: 6,
  average_trip_distance_km: 18,
  typical_travel_period: "7:00–9:00 AM and 5:00–8:00 PM",
  primary_travel_purpose: "Daily commute",
};
