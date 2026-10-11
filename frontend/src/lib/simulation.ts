export type Tier = "HIGH" | "LOW" | "NOT_REPORTED" | "VETO";

export interface Detection {
  id: string;
  seq: number;
  t: number; // epoch ms
  lat: number;
  lng: number;
  rssi: number; // dBm
  mac: string;
  peakTempC: number;
  ambientTempC: number;
  flame: boolean;
  tier: Tier;
  note: string;
  score: number;
  status: RescueStatus;
  logNote: string;
}

export const TIER_ORDER: Record<Tier, number> = {
  HIGH: 0,
  LOW: 1,
  VETO: 2,
  NOT_REPORTED: 3,
};

export const TIER_LABEL: Record<Tier, string> = {
  HIGH: "HIGH CONFIDENCE",
  LOW: "LOW CONFIDENCE",
  NOT_REPORTED: "NOT REPORTED",
  VETO: "VETO — HAZARD",
};

export const TIER_HEX: Record<Tier, string> = {
  HIGH: "#22d3a5",
  LOW: "#f5b93b",
  NOT_REPORTED: "#6b7a8f",
  VETO: "#f2545b",
};

export const SITE_CENTER = { lat: 28.6139, lng: 77.209 };
export const RSSI_THRESHOLD = -75;

/** Boustrophedon (lawnmower) grid over the site, in lat/lng. */
export function buildSweepPath(): { lat: number; lng: number }[] {
  const rows = 7;
  const latSpan = 0.0022;
  const lngSpan = 0.0034;
  const pts: { lat: number; lng: number }[] = [];
  for (let r = 0; r < rows; r++) {
    const lat = SITE_CENTER.lat - latSpan / 2 + (latSpan * r) / (rows - 1);
    const left = SITE_CENTER.lng - lngSpan / 2;
    const right = SITE_CENTER.lng + lngSpan / 2;
    const a = r % 2 === 0 ? left : right;
    const b = r % 2 === 0 ? right : left;
    pts.push({ lat, lng: a }, { lat, lng: b });
  }
  return pts;
}

export function pathLengthMeters(pts: { lat: number; lng: number }[]): number {
  let d = 0;
  for (let i = 1; i < pts.length; i++) d += haversine(pts[i - 1]!, pts[i]!);
  return d;
}

export function haversine(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Position along the path at progress 0..1 plus heading in degrees. */
export function positionAt(
  pts: { lat: number; lng: number }[],
  progress: number,
): { lat: number; lng: number; heading: number } {
  const segs = pts.length - 1;
  const p = Math.min(Math.max(progress, 0), 0.9999) * segs;
  const i = Math.floor(p);
  const f = p - i;
  const a = pts[i]!;
  const b = pts[i + 1]!;
  const heading = (Math.atan2(b.lng - a.lng, b.lat - a.lat) * 180) / Math.PI;
  return { lat: a.lat + (b.lat - a.lat) * f, lng: a.lng + (b.lng - a.lng) * f, heading };
}

function randMac() {
  const h = () =>
    Math.floor(Math.random() * 256)
      .toString(16)
      .padStart(2, "0")
      .toUpperCase();
  return [h(), h(), h(), "**", "**", h()].join(":");
}

/** Fusion logic: heat is the evidence, signal narrows the search, flame vetoes. */
export function classify(rssi: number, peakTempC: number, flame: boolean): { tier: Tier; note: string } {
  const signal = rssi > RSSI_THRESHOLD;
  const heat = peakTempC >= 30 && peakTempC <= 38;
  if (flame && heat) return { tier: "VETO", note: "Human-band cluster overlaps flame source — discarded as fire." };
  if (flame) return { tier: "VETO", note: "Flame sensor active in frame — reading discarded." };
  if (heat && signal)
    return { tier: "HIGH", note: "Signal and body-heat agree. Probable survivor — prioritise this drop point." };
  if (heat)
    return { tier: "HIGH", note: "Body-heat confirmed with no handset signal — phone lost or dead. Search directly." };
  if (signal)
    return { tier: "LOW", note: "Handset present, person unconfirmed. Sweep the surrounding void." };
  return { tier: "NOT_REPORTED", note: "No evidence on either channel. Pod stays silent rather than guessing." };
}

/** Weighted-random sensor draw so every tier appears over a realistic run. */
export function sampleReadings(): { rssi: number; peakTempC: number; flame: boolean } {
  const roll = Math.random();
  let rssi: number;
  let peakTempC: number;
  let flame = false;

  if (roll < 0.28) {
    rssi = -55 - Math.random() * 15;
    peakTempC = 31 + Math.random() * 6;
  } else if (roll < 0.4) {
    rssi = -82 - Math.random() * 12;
    peakTempC = 30.5 + Math.random() * 6.5;
  } else if (roll < 0.65) {
    rssi = -58 - Math.random() * 16;
    peakTempC = 12 + Math.random() * 15;
  } else if (roll < 0.8) {
    rssi = -60 - Math.random() * 20;
    peakTempC = 33 + Math.random() * 5;
    flame = true;
  } else {
    rssi = -84 - Math.random() * 11;
    peakTempC = 8 + Math.random() * 18;
  }
  if (!flame && Math.random() < 0.06) {
    flame = true;
    peakTempC = 120 + Math.random() * 300;
  }
  return { rssi: Math.round(rssi * 10) / 10, peakTempC: Math.round(peakTempC * 10) / 10, flame };
}

export function makeDetection(
  seq: number,
  pos: { lat: number; lng: number },
): Detection {
  const { rssi, peakTempC, flame } = sampleReadings();
  const { tier, note } = classify(rssi, peakTempC, flame);
  return {
    id: `DET-${String(seq).padStart(3, "0")}`,
    seq,
    t: Date.now(),
    lat: pos.lat + (Math.random() - 0.5) * 0.00018,
    lng: pos.lng + (Math.random() - 0.5) * 0.00026,
    rssi,
    mac: randMac(),
    peakTempC,
    ambientTempC: Math.round((16 + Math.random() * 6) * 10) / 10,
    flame,
    tier,
    note,
    score: confidenceScore(rssi, peakTempC, flame),
    status: "PENDING",
    logNote: "",
  };
}

export const THERM_W = 32;
export const THERM_H = 24;

/** 32x24 thermal frame: ambient noise + optional warm cluster + optional flame blob. */
export function thermalFrame(opts: { hot: boolean; flame: boolean; phase: number }): number[] {
  const { hot, flame, phase } = opts;
  const cx = THERM_W / 2 + Math.sin(phase / 7) * 5;
  const cy = THERM_H / 2 + Math.cos(phase / 9) * 3;
  const fx = 6 + Math.sin(phase / 5) * 2;
  const fy = 18 + Math.cos(phase / 6) * 2;
  const out: number[] = [];
  for (let y = 0; y < THERM_H; y++) {
    for (let x = 0; x < THERM_W; x++) {
      let v = 17 + Math.random() * 2.2 + Math.sin((x + phase) / 6) * 0.6;
      if (hot) {
        const d2 = (x - cx) ** 2 / 9 + (y - cy) ** 2 / 5;
        v += 19 * Math.exp(-d2 / 3.2);
      }
      if (flame) {
        const d2 = (x - fx) ** 2 / 4 + (y - fy) ** 2 / 3;
        v += 70 * Math.exp(-d2 / 2.2);
      }
      out.push(v);
    }
  }
  return out;
}

export function thermalColor(v: number): string {
  // ironbow-ish ramp, 14C -> 45C+
  const t = Math.min(Math.max((v - 14) / 31, 0), 1);
  const stops: Array<{ p: number; c: [number, number, number] }> = [
    { p: 0, c: [8, 14, 26] },
    { p: 0.35, c: [52, 22, 96] },
    { p: 0.55, c: [156, 36, 92] },
    { p: 0.72, c: [226, 96, 44] },
    { p: 0.88, c: [248, 186, 52] },
    { p: 1, c: [255, 250, 220] },
  ];
  for (let i = 1; i < stops.length; i++) {
    const hi = stops[i]!;
    const lo = stops[i - 1]!;
    if (t <= hi.p) {
      const f = (t - lo.p) / (hi.p - lo.p);
      const mix = (k: 0 | 1 | 2) => Math.round(lo.c[k] + (hi.c[k] - lo.c[k]) * f);
      return `rgb(${mix(0)},${mix(1)},${mix(2)})`;
    }
  }
  return "rgb(255,250,220)";
}

export function fmtClock(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function fmtTime(t: number) {
  return new Date(t).toLocaleTimeString("en-GB", { hour12: false });
}

/** Deterministic idle frame (SSR-safe: no randomness). */
export function idleFrame(): number[] {
  const out: number[] = [];
  for (let y = 0; y < THERM_H; y++) {
    for (let x = 0; x < THERM_W; x++) {
      out.push(17.5 + Math.sin(x / 5) * 0.5 + Math.cos(y / 4) * 0.4);
    }
  }
  return out;
}

/* ---------------- Rescue tasking ---------------- */

export type RescueStatus = "PENDING" | "DISPATCHED" | "RESCUED" | "NOT_FOUND";

export const RESCUE_STATUSES: RescueStatus[] = [
  "PENDING",
  "DISPATCHED",
  "RESCUED",
  "NOT_FOUND",
];

export const STATUS_LABEL: Record<RescueStatus, string> = {
  PENDING: "AWAITING TEAM",
  DISPATCHED: "TEAM EN ROUTE",
  RESCUED: "PERSON RESCUED",
  NOT_FOUND: "NOTHING FOUND",
};

export const STATUS_HEX: Record<RescueStatus, string> = {
  PENDING: "#6b7a8f",
  DISPATCHED: "#37e0ff",
  RESCUED: "#22d3a5",
  NOT_FOUND: "#f5b93b",
};

/** 0-100 confidence score behind the tier, for ranking within a tier. */
export function confidenceScore(rssi: number, peakTempC: number, flame: boolean): number {
  if (flame) return 0;
  const sig = Math.min(Math.max((rssi + 95) / 40, 0), 1); // -95dBm -> 0, -55dBm -> 1
  const band = 1 - Math.min(Math.abs(peakTempC - 34) / 6, 1); // peak at 34C
  const score = 100 * (0.62 * band + 0.38 * sig);
  return Math.round(score);
}

export function fmtDistance(m: number) {
  return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`;
}

/** Walking rescue team ETA at ~1.3 m/s over rubble. */
export function fmtEta(m: number) {
  const s = Math.round(m / 1.3);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export const RESCUER_START = { lat: SITE_CENTER.lat - 0.0016, lng: SITE_CENTER.lng - 0.0022 };
