"use client";

import "leaflet/dist/leaflet.css";
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import { useEffect, useMemo } from "react";
import type { ReactNode } from "react";

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  color?: string;
  label?: string;
  popup?: ReactNode;
  radius?: number;
}

export interface MapPolyline {
  id: string;
  positions: [number, number][];
  color?: string;
  weight?: number;
  dashArray?: string;
  opacity?: number;
}

function dotIcon(color: string, size = 14, ring = false) {
  return L.divIcon({
    className: "",
    html: `<span style="
      display:block;
      width:${size}px;height:${size}px;
      border-radius:9999px;
      background:${color};
      border:2px solid white;
      box-shadow:0 0 0 1px rgba(15,23,42,0.25), 0 1px 3px rgba(15,23,42,0.35);
      ${ring ? `outline:3px solid ${color}33;` : ""}
    "></span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function riderIcon(color: string) {
  return L.divIcon({
    className: "",
    html: `<span style="
      display:flex;align-items:center;justify-content:center;
      width:26px;height:26px;border-radius:9999px;
      background:${color};
      border:3px solid white;
      box-shadow:0 2px 6px rgba(15,23,42,0.45);
      color:white;font-size:13px;
    ">●</span>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

function FitBounds({ positions }: { positions: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length === 0) return;
    if (positions.length === 1) {
      map.setView(positions[0], 14);
      return;
    }
    const bounds = L.latLngBounds(positions);
    map.fitBounds(bounds, { padding: [32, 32] });
  }, [map, positions]);
  return null;
}

export function LeafletMapInner({
  center,
  zoom = 12,
  markers = [],
  polylines = [],
  riderPosition,
  riderColor = "#0e6e63",
  fitToContent = false,
  heightClass = "h-full",
}: {
  center: [number, number];
  zoom?: number;
  markers?: MapMarker[];
  polylines?: MapPolyline[];
  riderPosition?: { lat: number; lng: number } | null;
  riderColor?: string;
  fitToContent?: boolean;
  heightClass?: string;
}) {
  const fitPositions = useMemo<[number, number][]>(() => {
    const pts: [number, number][] = [];
    polylines.forEach((pl) => pts.push(...pl.positions));
    markers.forEach((m) => pts.push([m.lat, m.lng]));
    return pts;
  }, [markers, polylines]);

  return (
    <div className={heightClass}>
      <MapContainer
        center={center}
        zoom={zoom}
        scrollWheelZoom={false}
        className="h-full w-full rounded-lg"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {fitToContent && fitPositions.length > 0 && (
          <FitBounds positions={fitPositions} />
        )}
        {polylines.map((pl) => (
          <Polyline
            key={pl.id}
            positions={pl.positions}
            pathOptions={{
              color: pl.color ?? "#0e6e63",
              weight: pl.weight ?? 4,
              opacity: pl.opacity ?? 0.85,
              dashArray: pl.dashArray,
            }}
          />
        ))}
        {markers.map((m) => (
          <Marker
            key={m.id}
            position={[m.lat, m.lng]}
            icon={dotIcon(m.color ?? "#0e6e63", m.radius ?? 14)}
          >
            {m.popup && <Popup>{m.popup}</Popup>}
          </Marker>
        ))}
        {riderPosition && (
          <Marker
            position={[riderPosition.lat, riderPosition.lng]}
            icon={riderIcon(riderColor)}
            zIndexOffset={1000}
          />
        )}
      </MapContainer>
    </div>
  );
}
