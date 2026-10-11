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
  { id: "u1", username: "admin", password: "admin123", role: "admin", team: "HQ" },
  { id: "u2", username: "team1", password: "team123", role: "team", team: "Alpha" },
  { id: "u3", username: "team2", password: "team123", role: "team", team: "Bravo" },
  { id: "u4", username: "team3", password: "team123", role: "team", team: "Charlie" },
];

const TEAMS = ["Alpha", "Bravo", "Charlie", "Delta"];

let detections = [];
let liveStatus = { connected: false, lastSeen: null, lastVerdict: null };
let siteOrigin = { lat: 28.6139, lng: 77.2090, name: "Rescue Site" };

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
    { id: user.id, username: user.username, role: user.role, team: user.team },
    JWT_SECRET,
    { expiresIn: "12h" }
  );
  res.json({
    token,
    user: { id: user.id, username: user.username, role: user.role, team: user.team },
  });
});

app.get("/api/me", authMiddleware, (req, res) => res.json({ user: req.user }));
app.get("/api/teams", authMiddleware, (_req, res) => res.json({ teams: TEAMS }));
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
  res.json({ live: liveStatus, total: detections.length, site: siteOrigin });
});

// Admin assigns a response team to a detection
app.patch("/api/detections/:id/assign", authMiddleware, requireAdmin, (req, res) => {
  const { team, notes } = req.body || {};
  const det = detections.find((d) => d.id === req.params.id);
  if (!det) return res.status(404).json({ error: "Not found" });
  if (team && !TEAMS.includes(team)) return res.status(400).json({ error: "Invalid team" });

  det.assignedTeam = team || null;
  det.assignedAt = team ? new Date().toISOString() : null;
  det.assignedBy = req.user.username;
  if (notes !== undefined) det.notes = notes;

  io.emit("detection:updated", det);
  res.json({ detection: det });
});

// Admin sets exact location
app.patch("/api/detections/:id/location", authMiddleware, requireAdmin, (req, res) => {
  const { lat, lng } = req.body || {};
  const det = detections.find((d) => d.id === req.params.id);
  if (!det) return res.status(404).json({ error: "Not found" });
  if (typeof lat !== "number" || typeof lng !== "number") {
    return res.status(400).json({ error: "lat and lng required" });
  }
  det.lat = lat;
  det.lng = lng;
  det.locationSource = "admin";
  io.emit("detection:updated", det);
  res.json({ detection: det });
});

app.post("/api/detections/clear", authMiddleware, requireAdmin, (_req, res) => {
  detections = [];
  io.emit("detections:cleared");
  res.json({ ok: true });
});

app.post("/api/ingest", (req, res) => {
  const p = req.body;
  if (!p || !p.verdict) return res.status(400).json({ error: "Invalid payload" });

  // Location:
  // - If hardware sends GPS → use it
  // - Else approximate near site origin (admin can correct later)
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

io.on("connection", (socket) => {
  socket.emit("status", liveStatus);
  socket.emit("site:updated", siteOrigin);
  socket.emit("detections:init", detections.slice(0, 80));
});

server.listen(PORT, () => {
  console.log(`Backend http://localhost:${PORT}`);
});
