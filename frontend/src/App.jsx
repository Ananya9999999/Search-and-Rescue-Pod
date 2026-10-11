import { useState, useEffect, useCallback } from "react";
import { io } from "socket.io-client";
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from "react-leaflet";

const API = "http://localhost:4000";

function FitBounds({ points }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    const bounds = points.map((p) => [p.lat, p.lng]);
    if (bounds.length === 1) {
      map.setView(bounds[0], 16);
    } else {
      map.fitBounds(bounds, { padding: [40, 40] });
    }
  }, [points, map]);
  return null;
}

function Login({ onLogin }) {
  const [username, setUsername] = useState("team1");
  const [password, setPassword] = useState("team123");
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    try {
      const res = await fetch(`${API}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Login failed");
      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
      onLogin(data.user, data.token);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <h1>RSSI Rescue Pod</h1>
        <p>Search &amp; Rescue Dashboard</p>
        {error && <div className="login-error">{error}</div>}
        <label>Username</label>
        <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
        <label>Password</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <button type="submit">Sign in</button>
        <div className="login-hint">
          Admin: admin / admin123<br />
          Team: team1 / team123 or team2 / team123
        </div>
      </form>
    </div>
  );
}

function Dashboard({ user, token, onLogout }) {
  const [detections, setDetections] = useState([]);
  const [live, setLive] = useState({ connected: false, lastSeen: null, lastVerdict: null });
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    const socket = io(API, { transports: ["websocket", "polling"] });

    socket.on("connect", () => console.log("WS connected"));
    socket.on("status", (s) => setLive(s));
    socket.on("detection", (d) => {
      setDetections((prev) => {
        if (user.role !== "admin" && d.team !== user.team) return prev;
        return [d, ...prev].slice(0, 200);
      });
    });
    socket.on("detections:init", (list) => {
      const filtered =
        user.role === "admin" ? list : list.filter((d) => d.team === user.team);
      setDetections(filtered);
    });
    socket.on("detections:cleared", () => setDetections([]));

    // also fetch once
    fetch(`${API}/api/detections`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => setDetections(data.detections || []))
      .catch(() => {});

    return () => socket.disconnect();
  }, [user, token]);

  const clearAll = useCallback(async () => {
    if (user.role !== "admin") return;
    await fetch(`${API}/api/detections/clear`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
  }, [user, token]);

  const mapPoints = detections.filter((d) => d.lat && d.lng);

  return (
    <div className="dashboard">
      <header className="topbar">
        <h1>RSSI Rescue Pod</h1>
        <div className="meta">
          <span className={`badge ${live.connected ? "live" : "offline"}`}>
            {live.connected ? "● LIVE" : "○ Offline"}
          </span>
          {live.lastVerdict && (
            <span className="badge role">Last: {live.lastVerdict}</span>
          )}
          <span className="badge role">
            {user.role.toUpperCase()} · {user.team}
          </span>
          {user.role === "admin" && (
            <button className="btn-ghost" onClick={clearAll}>
              Clear all
            </button>
          )}
          <button className="btn-ghost" onClick={onLogout}>
            Logout
          </button>
        </div>
      </header>

      <div className="main">
        {/* Left: ranked detections */}
        <aside className="panel">
          <h2>Ranked Detections ({detections.length})</h2>
          {detections.length === 0 && (
            <div className="empty">Waiting for pod data…</div>
          )}
          {detections.map((d) => (
            <div
              key={d.id}
              className={`det-card ${d.verdict}`}
              onClick={() => setSelected(d)}
            >
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span className="tier">{d.verdict}</span>
                <span className="time">
                  {new Date(d.timestamp).toLocaleTimeString()}
                </span>
              </div>
              <div className="metrics">
                {d.temp_c != null && <span>{Number(d.temp_c).toFixed(1)}°C</span>}
                {d.rssi != null && <span>RSSI {d.rssi}</span>}
                {d.heat && <span>Heat</span>}
                {d.phone && <span>Phone</span>}
                {d.gas && <span>Gas</span>}
                {d.object && <span>Object</span>}
                <span>{d.team}</span>
              </div>
            </div>
          ))}
        </aside>

        {/* Center: map */}
        <div className="map-wrap">
          <MapContainer
            center={[28.6139, 77.209]}
            zoom={15}
            style={{ height: "100%", width: "100%" }}
          >
            <TileLayer
              attribution='&copy; OpenStreetMap'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <FitBounds points={mapPoints} />
            {mapPoints.map((d) => {
              const color =
                d.verdict === "HIGH"
                  ? "#22c55e"
                  : d.verdict === "LOW"
                  ? "#eab308"
                  : d.verdict === "VETO"
                  ? "#ef4444"
                  : "#94a3b8";
              return (
                <CircleMarker
                  key={d.id}
                  center={[d.lat, d.lng]}
                  radius={10}
                  pathOptions={{ color, fillColor: color, fillOpacity: 0.7 }}
                >
                  <Popup>
                    <strong>{d.verdict}</strong>
                    <br />
                    {d.temp_c != null && `${Number(d.temp_c).toFixed(1)}°C · `}
                    RSSI {d.rssi}
                    <br />
                    {new Date(d.timestamp).toLocaleString()}
                    <br />
                    Team: {d.team}
                  </Popup>
                </CircleMarker>
              );
            })}
          </MapContainer>
        </div>

        {/* Right: detail + log */}
        <aside className="panel">
          <h2>Selected</h2>
          {selected ? (
            <div className={`det-card ${selected.verdict}`} style={{ cursor: "default" }}>
              <div className="tier">{selected.verdict}</div>
              <div className="metrics" style={{ marginTop: 8 }}>
                <span>Temp: {selected.temp_c ?? "—"}°C</span>
                <span>RSSI: {selected.rssi ?? "—"}</span>
                <span>Heat: {selected.heat ? "Yes" : "No"}</span>
                <span>Phone: {selected.phone ? "Yes" : "No"}</span>
                <span>Gas: {selected.gas ? "Yes" : "No"}</span>
                <span>Object: {selected.object ? "Yes" : "No"}</span>
                <span>Team: {selected.team}</span>
                <span>{new Date(selected.timestamp).toLocaleString()}</span>
              </div>
            </div>
          ) : (
            <div className="empty">Click a detection</div>
          )}

          <h2 style={{ marginTop: "1.5rem" }}>Session Log</h2>
          <table className="log-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Tier</th>
                <th>Temp</th>
                <th>RSSI</th>
              </tr>
            </thead>
            <tbody>
              {detections.slice(0, 30).map((d) => (
                <tr key={d.id}>
                  <td>{new Date(d.timestamp).toLocaleTimeString()}</td>
                  <td>
                    <span className={`tier-pill ${d.verdict}`}>{d.verdict}</span>
                  </td>
                  <td>{d.temp_c != null ? Number(d.temp_c).toFixed(1) : "—"}</td>
                  <td>{d.rssi ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </aside>
      </div>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("user") || "null");
    } catch {
      return null;
    }
  });
  const [token, setToken] = useState(() => localStorage.getItem("token"));

  function handleLogin(u, t) {
    setUser(u);
    setToken(t);
  }

  function handleLogout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setUser(null);
    setToken(null);
  }

  if (!user || !token) {
    return <Login onLogin={handleLogin} />;
  }

  return <Dashboard user={user} token={token} onLogout={handleLogout} />;
}
