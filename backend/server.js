import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());

const JWT_SECRET = "rssi-rescue-pod-secret-2026";
const PORT = 4000;

const users = [
  { id: "u1", username: "admin", password: "admin123", role: "admin", team: "HQ", name: "Command Center" },
  { id: "u2", username: "team1", password: "team123", role: "team", team: "Alpha", name: "Ananya Singla" },
  { id: "u3", username: "team2", password: "team123", role: "team", team: "Bravo", name: "A Lisa" },
  { id: "u4", username: "team3", password: "team123", role: "team", team: "Charlie", name: "Rahul Mehta" },
];

const TEAMS = [
  { id: "Alpha", name: "Alpha", color: "#22c55e", members: ["Ananya Singla", "Vikram Shah"] },
  { id: "Bravo", name: "Bravo", color: "#3b82f6", members: ["A Lisa", "Priya Nair"] },
  { id: "Charlie", name: "Charlie", color: "#a855f7", members: ["Rahul Mehta", "Sneha Patel"] },
  { id: "Delta", name: "Delta", color: "#f59e0b", members: ["Arjun Rao"] },
];

const teamPositions = {
  Alpha: { lat: 28.6145, lng: 77.2080 },
  Bravo: { lat: 28.6130, lng: 77.2105 },
  Charlie: { lat: 28.6155, lng: 77.2095 },
  Delta: { lat: 28.6125, lng: 77.2075 },
};

let detections = [];
let messages = [];
let liveStatus = { connected: false, lastSeen: null, lastVerdict: null };
let siteOrigin = { lat: 28.6139, lng: 77.2090, name: "Collapse Site – Sector 12" };

/* ------------------------------------------------------------------ *
 *  ROUTING
 *  - asks OSRM for several alternatives and keeps the one with the
 *    lowest travel time (distance breaks ties)
 *  - falls back to a straight-line estimate if OSRM is unreachable
 *  - caches results briefly so ranking all teams stays cheap
 * ------------------------------------------------------------------ */
const FALLBACK_SPEED_MPS = 8.3; // ~30 km/h urban estimate when OSRM is down
const ROUTE_CACHE_MS = 60_000;
const routeCache = new Map();

function haversine(aLat, aLng, bLat, bLng) {
  const R = 6371000;
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function polylineLength(path) {
  let m = 0;
  for (let i = 1; i < path.length; i++) {
    m += haversine(path[i - 1][0], path[i - 1][1], path[i][0], path[i][1]);
  }
  return m;
}

async function fetchBestRoute(from, to) {
  const key = [from.lat, from.lng, to.lat, to.lng].map((n) => n.toFixed(5)).join(",");
  const hit = routeCache.get(key);
  if (hit && Date.now() - hit.at < ROUTE_CACHE_MS) return hit.route;

  let route;
  try {
    const url =
      `https://router.project-osrm.org/route/v1/driving/` +
      `${from.lng},${from.lat};${to.lng},${to.lat}` +
      `?overview=full&geometries=geojson&alternatives=3&steps=false`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 7000);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error("OSRM " + res.status);
    const data = await res.json();
    const options = (data?.routes || []).filter((r) => r?.geometry?.coordinates?.length);
    if (!options.length) throw new Error("No route");

    // Fastest wins; shorter distance breaks near-ties (within 2 s)
    const best = options.reduce((a, b) => {
      if (Math.abs(a.duration - b.duration) < 2) return a.distance <= b.distance ? a : b;
      return a.duration < b.duration ? a : b;
    });
    const slowest = Math.max(...options.map((r) => r.duration));

    // OSRM returns [lng, lat]; snap the ends to the exact start/target so the line connects
    const path = best.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
    if (haversine(from.lat, from.lng, path[0][0], path[0][1]) > 1) path.unshift([from.lat, from.lng]);
    const last = path[path.length - 1];
    if (haversine(to.lat, to.lng, last[0], last[1]) > 1) path.push([to.lat, to.lng]);

    route = {
      path,
      distance: best.distance,
      duration: best.duration,
      source: "road",
      alternatives: options.length,
      savedSeconds: Math.max(0, Math.round(slowest - best.duration)),
    };
  } catch (e) {
    console.warn("Routing fallback (straight line):", e.message);
    const distance = haversine(from.lat, from.lng, to.lat, to.lng);
    route = {
      path: [[from.lat, from.lng], [to.lat, to.lng]],
      distance,
      duration: distance / FALLBACK_SPEED_MPS,
      source: "straight",
      alternatives: 1,
      savedSeconds: 0,
    };
  }

  routeCache.set(key, { at: Date.now(), route });
  return route;
}

/* A team's next free position = the end of its pending job chain, else where it stands now */
function teamAnchor(teamId, excludeId = null) {
  const pending = pendingFor(teamId).filter((d) => d.id !== excludeId);
  const lastJob = pending[pending.length - 1];
  const queueEta = pending.reduce((s, d) => s + (d.durationSeconds || 0), 0);
  if (lastJob) return { lat: lastJob.lat, lng: lastJob.lng, queued: pending.length, queueEta };
  const p = teamPositions[teamId];
  return { lat: p.lat, lng: p.lng, queued: 0, queueEta: 0 };
}

function pendingFor(teamId) {
  return detections
    .filter((d) => d.verdict === "HIGH" && d.assignedTeam === teamId && d.status !== "reached")
    .sort((a, b) => new Date(a.assignedAt) - new Date(b.assignedAt));
}

/* Re-plan every pending job of one team, in order, from the team's current position.
 * Serialised per team so two admin clicks never race each other. */
const teamLocks = {};
function replanTeam(teamId) {
  teamLocks[teamId] = (teamLocks[teamId] || Promise.resolve()).then(async () => {
    const pending = pendingFor(teamId);
    let from = { lat: teamPositions[teamId].lat, lng: teamPositions[teamId].lng };
    let cumulative = 0;
    for (let i = 0; i < pending.length; i++) {
      const d = pending[i];
      const r = await fetchBestRoute(from, d);
      cumulative += r.duration;
      d.route = r.path;
      d.routeIdx = 0;
      d.distanceMeters = Math.round(r.distance);
      d.durationSeconds = Math.round(r.duration);
      d.etaSeconds = Math.round(cumulative);
      d.routeSource = r.source;
      d.routeAlternatives = r.alternatives;
      d.routeSavedSeconds = r.savedSeconds;
      d.remainingMeters = Math.round(r.distance);
      d.queuePosition = i;
      d.status = i === 0 ? "en_route" : "queued";
      io.emit("detection:updated", d);
      from = { lat: d.lat, lng: d.lng };
    }
    io.emit("teams:positions", teamPositions);
  });
  return teamLocks[teamId];
}

function clearRouteFields(d) {
  d.route = null;
  d.routeIdx = 0;
  d.distanceMeters = null;
  d.durationSeconds = null;
  d.etaSeconds = null;
  d.remainingMeters = null;
  d.routeSource = null;
  d.routeAlternatives = null;
  d.routeSavedSeconds = null;
  d.queuePosition = null;
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "No token" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

function requireAdmin(req, res, next) {
  if (req.user.role !== "admin") return res.status(403).json({ error: "Admin only" });
  next();
}

app.post("/api/login", (req, res) => {
  const { username, password } = req.body || {};
  const user = users.find((u) => u.username === username && u.password === password);
  if (!user) return res.status(401).json({ error: "Invalid credentials" });
  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role, team: user.team, name: user.name },
    JWT_SECRET,
    { expiresIn: "12h" }
  );
  res.json({
    token,
    user: { id: user.id, username: user.username, role: user.role, team: user.team, name: user.name },
  });
});

app.get("/api/me", authMiddleware, (req, res) => res.json({ user: req.user }));
app.get("/api/teams", authMiddleware, (_req, res) => res.json({ teams: TEAMS, positions: teamPositions }));
app.get("/api/site", authMiddleware, (_req, res) => res.json({ site: siteOrigin }));

app.put("/api/site", authMiddleware, requireAdmin, (req, res) => {
  const { lat, lng, name } = req.body || {};
  if (typeof lat === "number" && typeof lng === "number") {
    siteOrigin = { lat, lng, name: name || siteOrigin.name };
    io.emit("site:updated", siteOrigin);
  }
  res.json({ site: siteOrigin });
});

app.get("/api/detections", authMiddleware, (req, res) => {
  if (req.user.role === "admin") return res.json({ detections });
  const filtered = detections.filter(
    (d) => d.team === req.user.team || d.assignedTeam === req.user.team
  );
  res.json({ detections: filtered });
});

app.get("/api/status", authMiddleware, (_req, res) => {
  res.json({ live: liveStatus, total: detections.length, site: siteOrigin, positions: teamPositions });
});

/* Rank every team by how fast it could reach this detection (includes its queue) */
app.get("/api/detections/:id/options", authMiddleware, requireAdmin, async (req, res) => {
  const det = detections.find((d) => d.id === req.params.id);
  if (!det) return res.status(404).json({ error: "Not found" });
  if (!det.lat || !det.lng) return res.json({ options: [] });

  const options = await Promise.all(
    TEAMS.map(async (t) => {
      const anchor = teamAnchor(t.id, det.id);
      const r = await fetchBestRoute(anchor, det);
      return {
        team: t.id,
        color: t.color,
        distanceMeters: Math.round(r.distance),
        driveSeconds: Math.round(r.duration),
        queued: anchor.queued,
        etaSeconds: Math.round(anchor.queueEta + r.duration),
        routeSource: r.source,
        alternatives: r.alternatives,
        savedSeconds: r.savedSeconds,
      };
    })
  );
  options.sort((a, b) => a.etaSeconds - b.etaSeconds);
  options.forEach((o, i) => (o.fastest = i === 0));
  res.json({ options });
});

app.patch("/api/detections/:id/assign", authMiddleware, requireAdmin, async (req, res) => {
  let { team, notes } = req.body || {};
  const det = detections.find((d) => d.id === req.params.id);
  if (!det) return res.status(404).json({ error: "Not found" });

  // "auto" = pick whichever team can arrive first
  if (team === "auto") {
    const ranked = await Promise.all(
      TEAMS.map(async (t) => {
        const anchor = teamAnchor(t.id, det.id);
        const r = await fetchBestRoute(anchor, det);
        return { id: t.id, eta: anchor.queueEta + r.duration };
      })
    );
    ranked.sort((a, b) => a.eta - b.eta);
    team = ranked[0].id;
  }

  const valid = TEAMS.find((t) => t.id === team);
  if (team && !valid) return res.status(400).json({ error: "Invalid team" });

  const previousTeam = det.assignedTeam;
  det.assignedTeam = team || null;
  det.assignedAt = team ? new Date().toISOString() : null;
  det.assignedBy = req.user.name || req.user.username;
  if (notes !== undefined) det.notes = notes;
  det.status = team ? "en_route" : "unassigned";
  det.reachedAt = null;
  clearRouteFields(det);

  // Plan the new team's chain, and tidy the previous team's chain if it changed
  if (team) await replanTeam(team);
  if (previousTeam && previousTeam !== team) await replanTeam(previousTeam);

  io.emit("detection:updated", det);
  res.json({ detection: det });
});

app.patch("/api/detections/:id/location", authMiddleware, requireAdmin, async (req, res) => {
  const { lat, lng } = req.body || {};
  const det = detections.find((d) => d.id === req.params.id);
  if (!det) return res.status(404).json({ error: "Not found" });
  if (typeof lat !== "number" || typeof lng !== "number") {
    return res.status(400).json({ error: "lat and lng required" });
  }
  det.lat = lat;
  det.lng = lng;
  det.locationSource = "admin";

  // A moved target changes the whole chain behind it, so re-plan the team's jobs
  if (det.assignedTeam && det.status !== "reached") await replanTeam(det.assignedTeam);

  io.emit("detection:updated", det);
  res.json({ detection: det });
});

app.post("/api/detections/clear", authMiddleware, requireAdmin, (_req, res) => {
  detections = [];
  io.emit("detections:cleared");
  res.json({ ok: true });
});

app.get("/api/messages", authMiddleware, (_req, res) => {
  res.json({ messages: messages.slice(-100) });
});

app.post("/api/messages", authMiddleware, (req, res) => {
  const { text, toTeam } = req.body || {};
  if (!text || !String(text).trim()) return res.status(400).json({ error: "Empty message" });
  const msg = {
    id: uuidv4(),
    from: req.user.username,
    fromName: req.user.name || req.user.username,
    team: req.user.team,
    toTeam: toTeam || null,
    text: String(text).trim().slice(0, 500),
    timestamp: new Date().toISOString(),
  };
  messages.push(msg);
  if (messages.length > 300) messages = messages.slice(-300);
  io.emit("message", msg);
  res.json({ message: msg });
});

app.post("/api/ingest", (req, res) => {
  const p = req.body;
  if (!p || !p.verdict) return res.status(400).json({ error: "Invalid payload" });

  const hasGps = typeof p.lat === "number" && typeof p.lng === "number";
  const lat = hasGps ? p.lat : siteOrigin.lat + (Math.random() - 0.5) * 0.0012;
  const lng = hasGps ? p.lng : siteOrigin.lng + (Math.random() - 0.5) * 0.0012;

  const detection = {
    id: uuidv4(),
    timestamp: new Date().toISOString(),
    team: p.team || "Alpha",
    assignedTeam: null,
    assignedAt: null,
    assignedBy: null,
    notes: "",
    status: "unassigned", // unassigned | en_route | reached
    reachedAt: null,
    route: null, // [[lat,lng], ...] road path
    routeIdx: 0,
    distanceMeters: null,
    durationSeconds: null,
    etaSeconds: null,
    remainingMeters: null,
    routeSource: null, // road | straight
    routeAlternatives: null,
    routeSavedSeconds: null,
    queuePosition: null,
    temp_c: p.temp_c ?? p.object_temp_c ?? null,
    rssi: p.rssi ?? p.rssi_dbm ?? null,
    heat: !!(p.heat ?? p.heat_seen),
    phone: !!(p.phone ?? p.signal_seen),
    object: !!p.object,
    gas: !!(p.gas ?? p.flame_sensor),
    verdict: String(p.verdict).toUpperCase(),
    lat,
    lng,
    locationSource: hasGps ? "gps" : "approximate",
    source: p.source || "hardware",
  };

  detections.unshift(detection);
  if (detections.length > 500) detections = detections.slice(0, 500);

  liveStatus = {
    connected: true,
    lastSeen: detection.timestamp,
    lastVerdict: detection.verdict,
  };

  io.emit("detection", detection);
  io.emit("status", liveStatus);
  res.json({ ok: true, id: detection.id });
});

/* ------------------------------------------------------------------ *
 *  TEAM MOVEMENT (simulation)
 *  Teams advance a fixed distance per tick *along* the planned road
 *  path, so they never cut corners or drift off the route.
 * ------------------------------------------------------------------ */
const TICK_MS = 1000;
const SIM_SPEED_MPS = Number(process.env.SIM_SPEED_MPS) || 25; // faster than real life so the demo is watchable

function advanceAlongRoute(pos, det, stepMeters) {
  let left = stepMeters;
  while (left > 0 && det.routeIdx < det.route.length) {
    const [tLat, tLng] = det.route[det.routeIdx];
    const d = haversine(pos.lat, pos.lng, tLat, tLng);
    if (d <= left) {
      pos.lat = tLat;
      pos.lng = tLng;
      left -= d;
      det.routeIdx += 1;
    } else {
      const f = left / d;
      pos.lat += (tLat - pos.lat) * f;
      pos.lng += (tLng - pos.lng) * f;
      left = 0;
    }
  }
  return det.routeIdx >= det.route.length;
}

function remainingMeters(pos, det) {
  if (!det.route || det.routeIdx >= det.route.length) return 0;
  const rest = [[pos.lat, pos.lng], ...det.route.slice(det.routeIdx)];
  return polylineLength(rest);
}

setInterval(() => {
  let moved = false;
  for (const team of TEAMS) {
    const pos = teamPositions[team.id];
    const det = detections.find(
      (d) => d.verdict === "HIGH" && d.assignedTeam === team.id && d.status === "en_route" && d.route
    );
    if (!det) continue;

    const arrived = advanceAlongRoute(pos, det, SIM_SPEED_MPS * (TICK_MS / 1000));
    moved = true;

    if (arrived) {
      pos.lat = det.lat;
      pos.lng = det.lng;
      det.status = "reached";
      det.reachedAt = new Date().toISOString();
      det.remainingMeters = 0;
      det.etaSeconds = 0;
      det.queuePosition = null;
      io.emit("detection:updated", det);

      // Promote the next queued job, already planned from this exact spot
      const next = pendingFor(team.id)[0];
      if (next) {
        next.status = "en_route";
        next.queuePosition = 0;
        pendingFor(team.id).forEach((d, i) => (d.queuePosition = i));
        io.emit("detection:updated", next);
      }
    } else {
      det.remainingMeters = Math.round(remainingMeters(pos, det));
      const frac = det.distanceMeters ? det.remainingMeters / det.distanceMeters : 0;
      det.etaSeconds = Math.round((det.durationSeconds || 0) * frac);
      io.emit("detection:updated", det);
    }
  }
  if (moved) io.emit("teams:positions", teamPositions);
}, TICK_MS);

io.on("connection", (socket) => {
  socket.emit("status", liveStatus);
  socket.emit("site:updated", siteOrigin);
  socket.emit("detections:init", detections.slice(0, 80));
  socket.emit("teams:positions", teamPositions);
  socket.emit("messages:init", messages.slice(-50));
});

server.listen(PORT, () => {
  console.log(`Backend http://localhost:${PORT}`);
});
