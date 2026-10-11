import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

app.use(cors());
app.use(express.json());

const JWT_SECRET = "rssi-rescue-pod-secret-2026";
const PORT = 4000;

// ---------- Users (in-memory for demo) ----------
const users = [
  { id: "u1", username: "admin", password: "admin123", role: "admin", team: "HQ" },
  { id: "u2", username: "team1", password: "team123", role: "team", team: "Alpha" },
  { id: "u3", username: "team2", password: "team123", role: "team", team: "Bravo" },
];

// ---------- State ----------
let detections = []; // all detections
let sessions = {};   // team -> session info
let liveStatus = {
  connected: false,
  lastSeen: null,
  lastVerdict: null,
};

// ---------- Auth helpers ----------
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

// ---------- Routes ----------
app.get("/", (_req, res) => {
  res.json({
    name: "RSSI Rescue Pod Backend",
    status: "ok",
    live: liveStatus,
  });
});

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

app.get("/api/me", authMiddleware, (req, res) => {
  res.json({ user: req.user });
});

app.get("/api/detections", authMiddleware, (req, res) => {
  if (req.user.role === "admin") {
    return res.json({ detections });
  }
  // team only sees their own
  const filtered = detections.filter((d) => d.team === req.user.team);
  res.json({ detections: filtered });
});

app.get("/api/status", authMiddleware, (_req, res) => {
  res.json({ live: liveStatus, totalDetections: detections.length });
});

app.post("/api/detections/clear", authMiddleware, (req, res) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "Admin only" });
  }
  detections = [];
  io.emit("detections:cleared");
  res.json({ ok: true });
});

// Hardware ingest (from serial bridge or ESP Wi-Fi)
app.post("/api/ingest", (req, res) => {
  const payload = req.body;
  if (!payload || !payload.verdict) {
    return res.status(400).json({ error: "Invalid payload" });
  }

  const detection = {
    id: uuidv4(),
    timestamp: new Date().toISOString(),
    team: payload.team || "Alpha",
    temp_c: payload.temp_c ?? payload.object_temp_c ?? null,
    rssi: payload.rssi ?? payload.rssi_dbm ?? null,
    heat: !!payload.heat || !!payload.heat_seen,
    phone: !!payload.phone || !!payload.signal_seen,
    object: !!payload.object,
    gas: !!payload.gas || !!payload.flame_sensor,
    verdict: String(payload.verdict).toUpperCase(),
    lat: payload.lat ?? 28.6139 + (Math.random() - 0.5) * 0.002,
    lng: payload.lng ?? 77.209 + (Math.random() - 0.5) * 0.002,
    source: payload.source || "hardware",
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

// ---------- Socket.io ----------
io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);
  socket.emit("status", liveStatus);
  socket.emit("detections:init", detections.slice(0, 50));

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`RSSI Rescue backend running on http://localhost:${PORT}`);
  console.log("POST /api/ingest  ← hardware / serial bridge");
  console.log("WS   /socket.io   ← live dashboard");
});
