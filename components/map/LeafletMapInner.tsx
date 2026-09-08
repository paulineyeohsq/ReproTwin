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
  // Small pill shown above the marker (e.g. a live PM2.5 reading).
  label?: string;
  // Adds a small red "live" flag dot next to the label — only set this
  // when the label reflects genuinely real (live/historical) data, never
  // a synthetic/demo value.
  live?: boolean;
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

function dotIcon(color: string, size = 14, opts?: { label?: string; live?: boolean; ring?: boolean }) {
  const labelHtml = opts?.label
    ? `<span style="
        position:absolute; left:50%; top:0; transform:translate(-50%,-100%);
        display:flex; align-items:center; gap:3px;
        background:var(--card, #fff); border:1.5px solid ${color}; border-radius:9999px;
        padding:1px 6px 1px 5px; font-size:10px; font-weight:700; color:${color};
        white-space:nowrap; box-shadow:0 1px 3px rgba(28,24,21,0.25);
      ">${
        opts.live
          ? `<span style="width:5px;height:5px;border-radius:9999px;background:#a84338;box-shadow:0 0 0 2px rgba(168,67,56,0.25);"></span>`
          : ""
      }${opts.label}</span>`
    : "";
  return L.divIcon({
    className: "",
    html: `<span style="position:relative; display:block; width:${size}px; height:${size}px;">
      ${labelHtml}
      <span style="
        display:block; width:100%; height:100%;
        border-radius:9999px;
        background:${color};
        border:2px solid var(--card, #fff);
        box-shadow:0 0 0 1px rgba(28,24,21,0.2), 0 1px 3px rgba(28,24,21,0.3);
        ${opts?.ring ? `outline:3px solid ${color}33;` : ""}
      "></span>
    </span>`,
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
      border:3px solid var(--card, #fff);
      box-shadow:0 2px 6px rgba(28,24,21,0.4);
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
  riderColor = "#2c1e16",
  fitToContent = false,
  heightClass = "h-full",
  trafficTileUrl,
}: {
  center: [number, number];
  zoom?: number;
  markers?: MapMarker[];
  polylines?: MapPolyline[];
  riderPosition?: { lat: number; lng: number } | null;
  riderColor?: string;
  fitToContent?: boolean;
  heightClass?: string;
  // Leaflet TileLayer URL template (with {z}/{x}/{y} placeholders) for a
  // live traffic overlay — see app/api/traffic-tile for the proxy that
  // keeps TOMTOM_API_KEY server-side while still letting the browser make
  // per-tile requests directly, as a TileLayer requires.
  trafficTileUrl?: string;
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
        {trafficTileUrl && (
          <TileLayer attribution='Traffic: &copy; TomTom' url={trafficTileUrl} opacity={0.85} />
        )}
        {fitToContent && fitPositions.length > 0 && (
          <FitBounds positions={fitPositions} />
        )}
        {polylines.map((pl) => (
          <Polyline
            key={pl.id}
            positions={pl.positions}
            pathOptions={{
              color: pl.color ?? "#2c1e16",
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
            icon={dotIcon(m.color ?? "#2c1e16", m.radius ?? 14, { label: m.label, live: m.live })}
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
