import { useEffect, useRef } from "react";
import { MapContainer, TileLayer, Polyline, Marker, Tooltip, ZoomControl, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { VERDICT, TEAM_COLOR, initials, fmtDuration, fmtDistance } from "../lib/format";

/* Icons are cached so a marker is only re-created when its look actually changes.
   Re-creating one every render would restart the ripple animation. */
const iconCache = new Map();
function cachedIcon(key, build) {
  if (!iconCache.has(key)) iconCache.set(key, build());
  return iconCache.get(key);
}

function detectionIcon(d, selected) {
  const color = (VERDICT[d.verdict] || VERDICT.NONE).color;
  const needsTeam = d.verdict === "HIGH" && !d.assignedTeam;
  const key = `det|${color}|${needsTeam}|${selected}|${d.status}`;
  return cachedIcon(key, () =>
    L.divIcon({
      className: "",
      iconSize: [44, 44],
      iconAnchor: [22, 22],
      html: `<div class="pin ${needsTeam ? "ripple" : ""} ${selected ? "sel" : ""} ${d.status === "reached" ? "done" : ""}" style="--c:${color}">
               <span class="pin-wave"></span><span class="pin-core"></span>
             </div>`,
    })
  );
}

function teamIcon(teamId, label) {
  const color = TEAM_COLOR[teamId] || "#64748b";
  return cachedIcon(`team|${teamId}|${label}`, () =>
    L.divIcon({
      className: "team-pin",
      iconSize: [38, 38],
      iconAnchor: [19, 19],
      html: `<div class="team-chip" style="--c:${color}">${initials(label)}</div>`,
    })
  );
}

function FitControl({ points, signal }) {
  const map = useMap();
  const didInitial = useRef(false);

  // Fit once when the first data arrives, and again only on request.
  // (Fitting on every team move made the map jump around every second.)
  useEffect(() => {
    if (!points.length) return;
    if (didInitial.current && signal === 0) return;
    didInitial.current = true;
    const b = points.map((p) => [p.lat, p.lng]);
    if (b.length === 1) map.setView(b[0], 17);
    else map.fitBounds(b, { padding: [90, 90], maxZoom: 18 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signal, points.length > 0]);
  return null;
}

function FlyToSelected({ selected }) {
  const map = useMap();
  useEffect(() => {
    if (selected?.lat && selected?.lng) {
      map.flyTo([selected.lat, selected.lng], Math.max(map.getZoom(), 16), { duration: 0.6 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);
  return null;
}

function ClickToPick({ enabled, onPick }) {
  const map = useMap();
  useEffect(() => {
    map.getContainer().classList.toggle("picking", enabled);
  }, [enabled, map]);
  useMapEvents({
    click(e) {
      if (enabled) onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export default function MapView({ site, detections, positions, teams, routes, selected, onSelect, pickMode, onPick, onCancelPick, fitPoints, fitSignal, onFit }) {
  return (
    <div className="map">
      <MapContainer center={[site.lat, site.lng]} zoom={16} zoomControl={false} style={{ height: "100%", width: "100%" }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />
        <ZoomControl position="bottomright" />
        <FitControl points={fitPoints} signal={fitSignal} />
        <FlyToSelected selected={selected} />
        <ClickToPick enabled={pickMode} onPick={onPick} />

        {routes.map((r) => (
          <Polyline key={`${r.id}-c`} positions={r.positions} interactive={false} pathOptions={{ color: "#ffffff", weight: 10, opacity: 0.95, lineCap: "round", lineJoin: "round" }} />
        ))}
        {routes.map((r) => (
          <Polyline
            key={r.id}
            positions={r.positions}
            pathOptions={{ color: r.color, weight: 5, opacity: r.queued ? 0.55 : 1, dashArray: r.queued ? "2 10" : null, lineCap: "round", lineJoin: "round" }}
          >
            <Tooltip sticky direction="top" className="route-tip">
              {r.team} · {fmtDuration(r.eta)} · {fmtDistance(r.remaining)}
            </Tooltip>
          </Polyline>
        ))}

        {detections.map((d) =>
          d.lat && d.lng ? (
            <Marker
              key={d.id}
              position={[d.lat, d.lng]}
              icon={detectionIcon(d, selected?.id === d.id)}
              zIndexOffset={selected?.id === d.id ? 1000 : d.verdict === "HIGH" ? 400 : 0}
              eventHandlers={{ click: () => onSelect(d) }}
            />
          ) : null
        )}

        {Object.entries(positions).map(([teamId, pos]) => {
          const team = teams.find((t) => t.id === teamId);
          return (
            <Marker key={teamId} position={[pos.lat, pos.lng]} icon={teamIcon(teamId, team?.members?.[0] || teamId)} zIndexOffset={2000}>
              <Tooltip direction="bottom" offset={[0, 14]} className="route-tip">{teamId}</Tooltip>
            </Marker>
          );
        })}
      </MapContainer>

      <button className="fit-btn" onClick={onFit}>Show everything</button>

      {pickMode && (
        <div className="pick-banner" role="status">
          Click the map where the person was found
          <button onClick={onCancelPick}>Cancel</button>
        </div>
      )}

      <div className="legend" aria-hidden="true">
        {["HIGH", "LOW", "VETO"].map((k) => (
          <span key={k}><i style={{ background: VERDICT[k].color }} />{VERDICT[k].short}</span>
        ))}
      </div>
    </div>
  );
}
