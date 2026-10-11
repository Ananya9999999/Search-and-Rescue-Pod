import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { io } from "socket.io-client";
import Login from "./components/Login";
import MapView from "./components/MapView";
import DetectionList, { TeamsList } from "./components/DetectionList";
import DetailPanel from "./components/DetailPanel";
import ChatPanel from "./components/ChatPanel";
import { API, TEAM_COLOR, initials, fmtTime } from "./lib/format";

function Dashboard({ user, token, onLogout }) {
  const [detections, setDetections] = useState([]);
  const [live, setLive] = useState({ connected: false });
  const [site, setSite] = useState({ lat: 28.6139, lng: 77.209, name: "Collapse site" });
  const [teams, setTeams] = useState([]);
  const [positions, setPositions] = useState({});
  const [messages, setMessages] = useState([]);
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState("ALL");
  const [pickMode, setPickMode] = useState(false);
  const [notes, setNotes] = useState("");
  const [leftTab, setLeftTab] = useState("detections");
  const [rightTab, setRightTab] = useState("detail");
  const [fitSignal, setFitSignal] = useState(0);
  const [toasts, setToasts] = useState([]);
  const statusRef = useRef({});

  const headers = useMemo(
    () => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" }),
    [token]
  );

  const pushToast = useCallback((text) => {
    const id = crypto.randomUUID();
    setToasts((t) => [...t.slice(-2), { id, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000);
  }, []);

  useEffect(() => {
    const socket = io(API, { transports: ["websocket", "polling"] });
    const mine = (d) => user.role === "admin" || d.team === user.team || d.assignedTeam === user.team;

    socket.on("status", setLive);
    socket.on("site:updated", setSite);
    socket.on("teams:positions", (p) => setPositions({ ...p }));
    socket.on("message", (m) => setMessages((prev) => [...prev, m].slice(-100)));
    socket.on("messages:init", (list) => setMessages(list || []));
    socket.on("detection", (d) => {
      if (!mine(d)) return;
      setDetections((prev) => [d, ...prev.filter((x) => x.id !== d.id)].slice(0, 200));
    });
    socket.on("detection:updated", (d) => {
      if (statusRef.current[d.id] && statusRef.current[d.id] !== "reached" && d.status === "reached") {
        pushToast(`${d.assignedTeam} reached the detection at ${fmtTime(d.reachedAt || new Date().toISOString())}`);
      }
      statusRef.current[d.id] = d.status;
      setDetections((prev) => {
        const exists = prev.some((x) => x.id === d.id);
        if (exists) return prev.map((x) => (x.id === d.id ? d : x));
        return mine(d) ? [d, ...prev] : prev;
      });
      setSelected((s) => (s && s.id === d.id ? d : s));
    });
    socket.on("detections:init", (list) => setDetections(list.filter(mine)));
    socket.on("detections:cleared", () => {
      setDetections([]);
      setSelected(null);
    });

    const get = (path) => fetch(`${API}${path}`, { headers }).then((r) => r.json());
    get("/api/detections").then((d) => {
      const list = d.detections || [];
      list.forEach((x) => (statusRef.current[x.id] = x.status));
      setDetections(list);
    });
    get("/api/teams").then((d) => { setTeams(d.teams || []); setPositions(d.positions || {}); });
    get("/api/site").then((d) => d.site && setSite(d.site));
    get("/api/messages").then((d) => setMessages(d.messages || []));

    return () => socket.disconnect();
  }, [user, token, headers, pushToast]);

  // Reset the notes box only when a different detection is opened.
  // (Depending on the whole object would wipe typing on every live update.)
  useEffect(() => { setNotes(selected?.notes || ""); setPickMode(false); }, [selected?.id]);

  const filtered = useMemo(() => {
    if (filter === "ALL") return detections;
    if (filter === "UNASSIGNED") return detections.filter((d) => d.verdict === "HIGH" && !d.assignedTeam);
    return detections.filter((d) => d.verdict === filter);
  }, [detections, filter]);

  const stats = useMemo(() => ({
    high: detections.filter((d) => d.verdict === "HIGH").length,
    needsTeam: detections.filter((d) => d.verdict === "HIGH" && !d.assignedTeam).length,
    enRoute: detections.filter((d) => d.status === "en_route" || d.status === "queued").length,
    reached: detections.filter((d) => d.status === "reached").length,
  }), [detections]);

  // Only the part of the route still ahead of the team is drawn
  const routes = useMemo(() => {
    const out = [];
    for (const d of detections) {
      if (d.verdict !== "HIGH" || !d.assignedTeam || d.status === "reached") continue;
      if (!d.route || d.route.length < 2) continue;
      const queued = d.status === "queued";
      const pos = positions[d.assignedTeam];
      const pts = queued || !pos ? d.route : [[pos.lat, pos.lng], ...d.route.slice(d.routeIdx || 0)];
      if (pts.length < 2) continue;
      out.push({
        id: d.id,
        team: d.assignedTeam,
        color: TEAM_COLOR[d.assignedTeam] || "#64748b",
        positions: pts,
        queued,
        eta: d.etaSeconds,
        remaining: d.remainingMeters ?? d.distanceMeters,
      });
    }
    return out;
  }, [detections, positions]);

  const fitPoints = useMemo(() => {
    const pts = detections.filter((d) => d.lat && d.lng).map((d) => ({ lat: d.lat, lng: d.lng }));
    Object.values(positions).forEach((p) => pts.push(p));
    return pts;
  }, [detections, positions]);

  function open(d) {
    setSelected(d);
    setRightTab("detail");
  }

  function handleUpdated(d) {
    setSelected(d);
    setDetections((prev) => prev.map((x) => (x.id === d.id ? d : x)));
  }

  async function setLocation(lat, lng) {
    if (!selected || user.role !== "admin") return;
    const res = await fetch(`${API}/api/detections/${selected.id}/location`, {
      method: "PATCH", headers, body: JSON.stringify({ lat, lng }),
    });
    const data = await res.json();
    if (res.ok) { handleUpdated(data.detection); setPickMode(false); }
  }

  async function sendMessage(text, toTeam) {
    await fetch(`${API}/api/messages`, { method: "POST", headers, body: JSON.stringify({ text, toTeam }) });
  }

  async function clearAll() {
    if (user.role !== "admin") return;
    if (!confirm("Clear every detection from the log? This can't be undone.")) return;
    await fetch(`${API}/api/detections/clear`, { method: "POST", headers });
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="mark">R</span>
          <div>
            <h1>Rescue Pod</h1>
            <span className="muted">{site.name}</span>
          </div>
        </div>

        <dl className="stats">
          <div><dd>{stats.high}</dd><dt>High signals</dt></div>
          <div className={stats.needsTeam ? "alert" : ""}><dd>{stats.needsTeam}</dd><dt>Need a team</dt></div>
          <div><dd>{stats.enRoute}</dd><dt>On the way</dt></div>
          <div><dd>{stats.reached}</dd><dt>Reached</dt></div>
        </dl>

        <div className="top-right">
          <span className={`live ${live.connected ? "on" : ""}`}>
            <i />
            {live.connected ? "Pod live" : "Pod offline"}
            {live.lastSeen && <small>{fmtTime(live.lastSeen)}</small>}
          </span>
          {user.role === "admin" && <button className="btn ghost" onClick={clearAll}>Clear log</button>}
          <div className="user">
            <span className="avatar sm" style={{ "--team": TEAM_COLOR[user.team] || "#64748b" }}>{initials(user.name || user.username)}</span>
            <span className="user-text"><b>{user.name || user.username}</b><small>{user.role === "admin" ? "Command" : `${user.team} team`}</small></span>
          </div>
          <button className="btn ghost" onClick={onLogout}>Sign out</button>
        </div>
      </header>

      <main className="stage">
        <MapView
          site={site}
          detections={filtered}
          positions={positions}
          teams={teams}
          routes={routes}
          selected={selected}
          onSelect={open}
          pickMode={pickMode}
          onPick={setLocation}
          onCancelPick={() => setPickMode(false)}
          fitPoints={fitPoints}
          fitSignal={fitSignal}
          onFit={() => setFitSignal((n) => n + 1)}
        />

        <aside className="panel left" aria-label="Detections and teams">
          <div className="tabs">
            <button className={leftTab === "detections" ? "on" : ""} onClick={() => setLeftTab("detections")}>
              Detections <span className="count">{detections.length}</span>
            </button>
            <button className={leftTab === "teams" ? "on" : ""} onClick={() => setLeftTab("teams")}>Teams</button>
          </div>
          {leftTab === "detections" ? (
            <DetectionList detections={filtered} filter={filter} setFilter={setFilter} selectedId={selected?.id} onSelect={open} />
          ) : (
            <TeamsList teams={teams} detections={detections} />
          )}
        </aside>

        <aside className="panel right" aria-label="Details and chat">
          <div className="tabs">
            <button className={rightTab === "detail" ? "on" : ""} onClick={() => setRightTab("detail")}>Details</button>
            <button className={rightTab === "chat" ? "on" : ""} onClick={() => setRightTab("chat")}>Team chat</button>
          </div>
          {rightTab === "chat" ? (
            <ChatPanel user={user} messages={messages} onSend={sendMessage} />
          ) : (
            <DetailPanel
              selected={selected}
              user={user}
              headers={headers}
              teams={teams}
              notes={notes}
              setNotes={setNotes}
              pickMode={pickMode}
              setPickMode={setPickMode}
              onUpdated={handleUpdated}
              onClose={() => setSelected(null)}
            />
          )}
        </aside>

        <div className="toasts" aria-live="polite">
          {toasts.map((t) => <div key={t.id} className="toast">{t.text}</div>)}
        </div>
      </main>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem("user") || "null"); } catch { return null; }
  });
  const [token, setToken] = useState(() => localStorage.getItem("token"));

  if (!user || !token) {
    return <Login onLogin={(u, t) => { setUser(u); setToken(t); }} />;
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
