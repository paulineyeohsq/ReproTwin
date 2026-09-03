import type { BaseRoute, RouteWaypointDef } from "./types";
import { routeDistanceKm } from "./geo";

// Hand-authored, approximate Klang Valley waypoint sequences.
// These are demonstration paths for the prototype map — not turn-by-turn
// navigation data.

function route(
  id: string,
  name: string,
  origin: string,
  destination: string,
  waypoints: RouteWaypointDef[]
): BaseRoute {
  return {
    id,
    name,
    origin,
    destination,
    waypoints,
    distanceKm: routeDistanceKm(waypoints),
  };
}

export const BASE_ROUTES: BaseRoute[] = [
  route("pj-kl", "Petaling Jaya → Kuala Lumpur", "Petaling Jaya", "Kuala Lumpur", [
    { lat: 3.1073, lng: 101.6067, roadType: "residential" },
    { lat: 3.1104, lng: 101.6209, roadType: "arterial" },
    { lat: 3.1256, lng: 101.6389, roadType: "highway" },
    { lat: 3.1373, lng: 101.6586, roadType: "highway" },
    { lat: 3.1462, lng: 101.6768, roadType: "arterial" },
    { lat: 3.1478, lng: 101.6953, roadType: "residential" },
  ]),
  route(
    "pj-subang",
    "Petaling Jaya → Subang Jaya",
    "Petaling Jaya",
    "Subang Jaya",
    [
      { lat: 3.1073, lng: 101.6067, roadType: "residential" },
      { lat: 3.0951, lng: 101.5985, roadType: "arterial" },
      { lat: 3.0793, lng: 101.5904, roadType: "highway" },
      { lat: 3.0653, lng: 101.5862, roadType: "arterial" },
      { lat: 3.0567, lng: 101.5851, roadType: "residential" },
    ]
  ),
  route("pj-bangsar", "Petaling Jaya → Bangsar", "Petaling Jaya", "Bangsar", [
    { lat: 3.1073, lng: 101.6067, roadType: "residential" },
    { lat: 3.114, lng: 101.628, roadType: "arterial" },
    { lat: 3.122, lng: 101.652, roadType: "arterial" },
    { lat: 3.1275, lng: 101.669, roadType: "residential" },
    { lat: 3.1286, lng: 101.6767, roadType: "residential" },
  ]),
  route(
    "pj-shahalam",
    "Petaling Jaya → Shah Alam",
    "Petaling Jaya",
    "Shah Alam",
    [
      { lat: 3.1073, lng: 101.6067, roadType: "residential" },
      { lat: 3.0975, lng: 101.585, roadType: "arterial" },
      { lat: 3.0862, lng: 101.562, roadType: "highway" },
      { lat: 3.079, lng: 101.539, roadType: "highway" },
      { lat: 3.0733, lng: 101.5185, roadType: "arterial" },
    ]
  ),
];

export function findBaseRouteByDestination(destination: string): BaseRoute {
  const r = BASE_ROUTES.find((r) => r.destination === destination);
  if (!r) throw new Error(`No base route for destination ${destination}`);
  return r;
}
