import { useState, useEffect, useMemo } from "react";
import { io } from "socket.io-client";
import { MapContainer, TileLayer, CircleMarker, Popup, useMapEvents, useMap } from "react-leaflet";

const API = "http://localhost:4000";

const TIER_COLOR = {
  HIGH: "#22c55e",
  LOW: "#eab308",
  VETO: "#ef4444",
  NONE: "#64748b",
};

function FitBounds({ points }) {
  const map = useMap();
  useEffect(() => {
    if (!points.length) return;
    const b = points.map((p) => [p.lat, p.lng]);
    if (b.length === 1) map.setView(b[0], 17);
    else map.fitBounds(b, { padding: [50, 50], maxZoom: 18 });
  }, [points, map]);
  return null;
}

function MapClickHandler({ enabled, onPick }) {
  useMapEvents({
    click(e) {
      if (enabled) onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function Login({ onLogin }) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("admin123");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
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
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={submit}>
        <div className="logo">RSSI</div>
        <h1>Rescue Pod Command</h1>
        <p>Live search &amp; rescue coordination</p>
        {error && <div className="login-error">{error}</div>}
        <label>Username</label>
        <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
        <label>Password</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <button type="submit" disabled={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </button>
        <div className="login-hint">
          <strong>Admin</strong> admin / admin123<br />
          <strong>Team</strong> team1 / team123 · team2 / team123 · team3 / team123
        </div>
      </form>
    </div>
  );
}

function Dashboard({ user, token, onLogout }) {
  const [detections, setDetections] = useState([]);
  const [live, setLive] = useState({ connected: false, lastSeen: null, lastVerdict: null });
  const [site, setSite] = useState({ lat: 28.6139, lng: 77.209, name: "Rescue Site" });
  const [teams, setTeams] = useState(["Alpha", "Bravo", "Charlie", "Delta"]);
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState("ALL");
  const [pickMode, setPickMode] = useState(false);
  const [assignTeam, setAssignTeam] = useState("");
  const [notes, setNotes] = useState("");

  const headers = useMemo(
    () => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" }),
    [token]
  );

  useEffect(() => {
    const socket = io(API, { transports: ["websocket", "polling"] });

    socket.on("status", setLive);
    socket.on("site:updated", setSite);
    socket.on("detection", (d) => {
      setDetections((prev) => {
        if (user.role !== "admin" && d.team !== user.team && d.assignedTeam !== user.team)
          return prev;
        return [d, ...prev.filter((x) => x.id !== d.id)].slice(0, 200);
      });
    });
    socket.on("detection:updated", (d) => {
      setDetections((prev) => prev.map((x) => (x.id === d.id ? d : x)));
      setSelected((s) => (s && s.id === d.id ? d : s));
    });
    socket.on("detections:init", (list) => {
      const filtered =
        user.role === "admin"
          ? list
          : list.filter((d) => d.team === user.team || d.assignedTeam === user.team);
      setDetections(filtered);
    });
    socket.on("detections:cleared", () => {
      setDetections([]);
      setSelected(null);
    });

    fetch(`${API}/api/detections`, { headers })
      .then((r) => r.json())
      .then((d) => setDetections(d.detections || []))
      .catch(() => {});
    fetch(`${API}/api/teams`, { headers })
      .then((r) => r.json())
      .then((d) => setTeams(d.teams || []));
    fetch(`${API}/api/site`, { headers })
      .then((r) => r.json())
      .then((d) => setSite(d.site));

    return () => socket.disconnect();
  }, [user, token, headers]);

  const filtered = useMemo(() => {
    if (filter === "ALL") return detections;
    if (filter === "UNASSIGNED") return detections.filter((d) => d.verdict === "HIGH" && !d.assignedTeam);
    return detections.filter((d) => d.verdict === filter);
  }, [detections, filter]);

  const stats = useMemo(() => {
    const high = detections.filter((d) => d.verdict === "HIGH").length;
    const low = detections.filter((d) => d.verdict === "LOW").length;
    const veto = detections.filter((d) => d.verdict === "VETO").length;
    const assigned = detections.filter((d) => d.assignedTeam).length;
    return { high, low, veto, assigned, total: detections.length };
  }, [detections]);

  async function assign() {
    if (!selected || user.role !== "admin") return;
    const res = await fetch(`${API}/api/detections/${selected.id}/assign`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ team: assignTeam || null, notes }),
    });
    const data = await res.json();
    if (res.ok) setSelected(data.detection);
  }

  async function setLocation(lat, lng) {
    if (!selected || user.role !== "admin") return;
    const res = await fetch(`${API}/api/detections/${selected.id}/location`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ lat, lng }),
    });
    const data = await res.json();
    if (res.ok) {
      setSelected(data.detection);
      setPickMode(false);
    }
  }

  async function clearAll() {
    if (user.role !== "admin") return;
    if (!confirm("Clear all detections?")) return;
    await fetch(`${API}/api/detections/clear`, { method: "POST", headers });
  }

  useEffect(() => {
    if (selected) {
      setAssignTeam(selected.assignedTeam || "");
      setNotes(selected.notes || "");
    }
  }, [selected]);

  return (
    <div className="dashboard">
      <header className="topbar">
        <div className="brand">
          <span className="logo-sm">RSSI</span>
          <div>
            <h1>Rescue Pod Command</h1>
            <span className="sub">{site.name}</span>
          </div>
        </div>

        <div className="stats-bar">
          <div className="stat"><span className="n">{stats.high}</span><span className="l">HIGH</span></div>
          <div className="stat"><span className="n">{stats.low}</span><span className="l">LOW</span></div>
          <div className="stat"><span className="n">{stats.veto}</span><span className="l">VETO</span></div>
          <div className="stat"><span className="n">{stats.assigned}</span><span className="l">Assigned</span></div>
        </div>

        <div className="meta">
          <span className={`badge ${live.connected ? "live" : "offline"}`}>
            {live.connected ? "● LIVE" : "○ Offline"}
          </span>
          <span className="badge role">{user.role.toUpperCase()} · {user.team}</span>
          {user.role === "admin" && (
            <button className="btn-ghost" onClick={clearAll}>Clear</button>
          )}
          <button className="btn-ghost" onClick={onLogout}>Logout</button>
        </div>
      </header>

      <div className="main">
        <aside className="panel left">
          <div className="panel-head">
            <h2>Detections</h2>
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="ALL">All</option>
              <option value="HIGH">HIGH only</option>
              <option value="LOW">LOW only</option>
              <option value="VETO">VETO only</option>
              <option value="UNASSIGNED">Unassigned HIGH</option>
            </select>
          </div>

          <div className="list">
            {filtered.length === 0 && <div className="empty">No detections yet</div>}
            {filtered.map((d) => (
              <div
                key={d.id}
                className={`det-card ${d.verdict} ${selected?.id === d.id ? "active" : ""}`}
                onClick={() => setSelected(d)}
              >
                <div className="row">
                  <span className="tier">{d.verdict}</span>
                  <span className="time">{new Date(d.timestamp).toLocaleTimeString()}</span>
                </div>
                <div className="metrics">
                  {d.temp_c != null && <span>{Number(d.temp_c).toFixed(1)}°C</span>}
                  {d.rssi != null && <span>{d.rssi} dBm</span>}
                  {d.heat && <span className="tag">Heat</span>}
                  {d.phone && <span className="tag">Phone</span>}
                  {d.gas && <span className="tag danger">Gas</span>}
                </div>
                <div className="assign-line">
                  {d.assignedTeam ? (
                    <span className="assigned">→ {d.assignedTeam}</span>
                  ) : d.verdict === "HIGH" ? (
                    <span className="unassigned">Unassigned</span>
                  ) : null}
                  <span className="loc-src">{d.locationSource}</span>
                </div>
              </div>
            ))}
          </div>
        </aside>

        <div className="map-wrap">
          {pickMode && (
            <div className="pick-banner">
              Click on the map to set location for the selected detection
              <button onClick={() => setPickMode(false)}>Cancel</button>
            </div>
          )}
          <MapContainer center={[site.lat, site.lng]} zoom={16} style={{ height: "100%", width: "100%" }}>
            <TileLayer
              attribution='&copy; OpenStreetMap'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <FitBounds points={filtered.filter((d) => d.lat && d.lng)} />
            <MapClickHandler enabled={pickMode} onPick={setLocation} />
            {filtered.map((d) => {
              if (!d.lat || !d.lng) return null;
              const color = TIER_COLOR[d.verdict] || "#64748b";
              return (
                <CircleMarker
                  key={d.id}
                  center={[d.lat, d.lng]}
                  radius={selected?.id === d.id ? 14 : 10}
                  pathOptions={{
                    color,
                    fillColor: color,
                    fillOpacity: d.assignedTeam ? 0.9 : 0.55,
                    weight: selected?.id === d.id ? 3 : 2,
                  }}
                  eventHandlers={{ click: () => setSelected(d) }}
                >
                  <Popup>
                    <strong>{d.verdict}</strong>
                    {d.assignedTeam && <> · Team {d.assignedTeam}</>}
                    <br />
                    {d.temp_c != null && `${Number(d.temp_c).toFixed(1)}°C · `}
                    RSSI {d.rssi}
                    <br />
                    {new Date(d.timestamp).toLocaleString()}
                  </Popup>
                </CircleMarker>
              );
            })}
          </MapContainer>
        </div>

        <aside className="panel right">
          <h2>Detail</h2>
          {!selected ? (
            <div className="empty">Select a detection</div>
          ) : (
            <div className="detail">
              <div className={`detail-tier ${selected.verdict}`}>{selected.verdict}</div>
              <div className="detail-grid">
                <div><label>Temperature</label><span>{selected.temp_c != null ? `${Number(selected.temp_c).toFixed(1)} °C` : "—"}</span></div>
                <div><label>RSSI</label><span>{selected.rssi != null ? `${selected.rssi} dBm` : "—"}</span></div>
                <div><label>Heat</label><span>{selected.heat ? "Yes" : "No"}</span></div>
                <div><label>Phone</label><span>{selected.phone ? "Yes" : "No"}</span></div>
                <div><label>Gas</label><span>{selected.gas ? "Yes" : "No"}</span></div>
                <div><label>Object</label><span>{selected.object ? "Yes" : "No"}</span></div>
                <div><label>Reported by</label><span>{selected.team}</span></div>
                <div><label>Location</label><span>{selected.locationSource}</span></div>
                <div className="full"><label>Time</label><span>{new Date(selected.timestamp).toLocaleString()}</span></div>
                <div className="full"><label>Coords</label><span>{selected.lat?.toFixed(5)}, {selected.lng?.toFixed(5)}</span></div>
              </div>

              {user.role === "admin" && (
                <div className="admin-actions">
                  <h3>Assign Response Team</h3>
                  <select value={assignTeam} onChange={(e) => setAssignTeam(e.target.value)}>
                    <option value="">— Unassigned —</option>
                    {teams.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                  <textarea
                    placeholder="Notes for the team…"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                  />
                  <button className="btn-primary" onClick={assign}>
                    {assignTeam ? `Assign to ${assignTeam}` : "Clear assignment"}
                  </button>

                  <h3>Correct Location</h3>
                  <p className="hint">
                    Current location is <strong>{selected.locationSource}</strong>.
                    Click “Pick on map” then click the correct place on the map.
                  </p>
                  <button
                    className={`btn-secondary ${pickMode ? "active" : ""}`}
                    onClick={() => setPickMode((v) => !v)}
                  >
                    {pickMode ? "Cancel pick" : "Pick on map"}
                  </button>
                </div>
              )}

              {selected.assignedTeam && (
                <div className="assigned-box">
                  Assigned to <strong>{selected.assignedTeam}</strong>
                  {selected.assignedBy && <> by {selected.assignedBy}</>}
                  {selected.notes && <p>{selected.notes}</p>}
                </div>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem("user") || "null"); } catch { return null; }
  });
  const [token, setToken] = useState(() => localStorage.getItem("token"));

  if (!user || !token) {
    return (
      <Login
        onLogin={(u, t) => {
          setUser(u);
          setToken(t);
        }}
      />
    );
  }

  return (
    <Dashboard
      user={user}
      token={token}
      onLogout={() => {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        setUser(null);
        setToken(null);
      }}
    />
  );
}
