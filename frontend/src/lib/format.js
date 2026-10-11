export const API = "http://localhost:4000";

export const VERDICT = {
  HIGH: { color: "#0e9f6e", label: "High confidence", short: "High" },
  LOW: { color: "#d99100", label: "Low confidence", short: "Low" },
  VETO: { color: "#d63b32", label: "Gas hazard", short: "Veto" },
  NONE: { color: "#8693a1", label: "No signal", short: "None" },
};

export const TEAM_COLOR = {
  Alpha: "#0e9f6e",
  Bravo: "#2f6df6",
  Charlie: "#8b5cf6",
  Delta: "#e08a00",
  HQ: "#64748b",
};

export function initials(name = "") {
  return name
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function fmtDuration(sec) {
  if (sec == null) return "—";
  if (sec < 45) return "< 1 min";
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}

export function fmtDistance(m) {
  if (m == null) return "—";
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}

/** Map RSSI (-100 weak … -40 strong) to 0–4 bars */
export function rssiBars(rssi) {
  if (rssi == null) return 0;
  if (rssi >= -55) return 4;
  if (rssi >= -65) return 3;
  if (rssi >= -75) return 2;
  if (rssi >= -90) return 1;
  return 0;
}

export const LOCATION_COPY = {
  approximate: "Approximate. The pod has no GPS, so this is placed near the site. Pick the real spot on the map.",
  gps: "From a GPS fix sent with the reading.",
  admin: "Set by command on the map.",
};
