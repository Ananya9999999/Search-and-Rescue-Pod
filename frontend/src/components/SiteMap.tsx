import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { SITE_CENTER, STATUS_HEX, TIER_HEX, type Detection } from "@/lib/simulation";

interface Props {
  path: { lat: number; lng: number }[];
  pod: { lat: number; lng: number; heading: number };
  progress: number;
  running: boolean;
  detections: Detection[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  rescuer: { lat: number; lng: number };
  target: Detection | null;
}

export default function SiteMap({
  path,
  pod,
  progress,
  running,
  detections,
  selectedId,
  onSelect,
  rescuer,
  target,
}: Props) {
  const el = useRef<HTMLDivElement | null>(null);
  const map = useRef<L.Map | null>(null);
  const podMarker = useRef<L.Marker | null>(null);
  const rescuerMarker = useRef<L.Marker | null>(null);
  const routeLine = useRef<L.Polyline | null>(null);
  const trail = useRef<L.Polyline | null>(null);
  const markers = useRef<Map<string, L.CircleMarker>>(new Map());
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, {
      center: [SITE_CENTER.lat, SITE_CENTER.lng],
      zoom: 17,
      zoomControl: true,
      attributionControl: true,
    });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap contributors",
      className: "site-tiles",
    }).addTo(m);

    L.polyline(
      path.map((p) => [p.lat, p.lng] as [number, number]),
      { color: "#3f6c8a", weight: 1.5, dashArray: "4 6", opacity: 0.8 },
    ).addTo(m);

    trail.current = L.polyline([], { color: "#37e0ff", weight: 2.5, opacity: 0.9 }).addTo(m);

    podMarker.current = L.marker([path[0]!.lat, path[0]!.lng], {
      icon: L.divIcon({ className: "pod-icon-wrap", html: podHtml(0), iconSize: [34, 34] }),
      zIndexOffset: 1000,
    }).addTo(m);

    routeLine.current = L.polyline([], {
      color: STATUS_HEX.DISPATCHED,
      weight: 2,
      dashArray: "6 6",
      opacity: 0.9,
    }).addTo(m);

    rescuerMarker.current = L.marker([rescuer.lat, rescuer.lng], {
      icon: L.divIcon({ className: "pod-icon-wrap", html: rescuerHtml(), iconSize: [30, 30] }),
      zIndexOffset: 900,
    })
      .addTo(m)
      .bindTooltip("RESCUE TEAM ALPHA", { direction: "top", offset: [0, -10] });

    map.current = m;
    return () => {
      m.remove();
      map.current = null;
      markers.current.clear();
    };
  }, [path]);

  // pod position + swept trail
  useEffect(() => {
    if (!map.current || !podMarker.current || !trail.current) return;
    podMarker.current.setLatLng([pod.lat, pod.lng]);
    const icon = podMarker.current.getElement();
    if (icon) icon.innerHTML = podHtml(pod.heading, running);
    const segs = path.length - 1;
    const upto = Math.min(Math.max(progress, 0), 0.9999) * segs;
    const pts: [number, number][] = path
      .slice(0, Math.floor(upto) + 1)
      .map((p) => [p.lat, p.lng]);
    pts.push([pod.lat, pod.lng]);
    trail.current.setLatLngs(pts);
  }, [pod, progress, path, running]);

  // detection markers
  useEffect(() => {
    if (!map.current) return;
    for (const d of detections) {
      if (markers.current.has(d.id)) continue;
      const cm = L.circleMarker([d.lat, d.lng], {
        radius: d.tier === "NOT_REPORTED" ? 5 : 8,
        color: TIER_HEX[d.tier],
        weight: 2,
        fillColor: TIER_HEX[d.tier],
        fillOpacity: d.tier === "NOT_REPORTED" ? 0.25 : 0.55,
      })
        .addTo(map.current)
        .on("click", () => onSelectRef.current(d.id));
      cm.bindTooltip(`${d.id} · ${d.tier.replace("_", " ")}`, { direction: "top", offset: [0, -8] });
      markers.current.set(d.id, cm);
    }
    for (const [id, cm] of markers.current) {
      if (!detections.some((d) => d.id === id)) {
        cm.remove();
        markers.current.delete(id);
      }
    }
  }, [detections]);

  // selection highlight + rescue status ring
  useEffect(() => {
    for (const [id, cm] of markers.current) {
      const on = id === selectedId;
      const det = detections.find((d) => d.id === id);
      const ring =
        det && det.status !== "PENDING" ? STATUS_HEX[det.status] : det ? TIER_HEX[det.tier] : "#fff";
      cm.setStyle({ weight: on ? 5 : 2, fillOpacity: on ? 0.85 : 0.45, color: ring });
      if (det) {
        cm.setTooltipContent(
          `${det.id} · ${det.tier.replace("_", " ")} · ${det.status.replace("_", " ")}`,
        );
      }
      if (on) {
        cm.bringToFront();
        map.current?.panTo(cm.getLatLng(), { animate: true });
      }
    }
  }, [selectedId, detections]);

  // rescue team + tasking line
  useEffect(() => {
    rescuerMarker.current?.setLatLng([rescuer.lat, rescuer.lng]);
    routeLine.current?.setLatLngs(
      target
        ? ([
            [rescuer.lat, rescuer.lng],
            [target.lat, target.lng],
          ] as [number, number][])
        : [],
    );
  }, [rescuer, target]);

  return <div ref={el} className="h-full w-full" />;
}

function rescuerHtml() {
  return `<div class="rescuer-icon">
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="5" r="3" />
      <path d="M12 8v7M12 15l-4 6M12 15l4 6M6 11h12" />
    </svg>
  </div>`;
}

function podHtml(heading: number, running = false) {
  return `<div class="pod-icon ${running ? "pod-icon--live" : ""}" style="transform:rotate(${heading}deg)">
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round">
      <path d="M12 2 L19 21 L12 17 L5 21 Z" />
    </svg>
  </div>`;
}
