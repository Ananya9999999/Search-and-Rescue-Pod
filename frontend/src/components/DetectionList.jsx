import { VERDICT, TEAM_COLOR, fmtTime, fmtDuration, rssiBars } from "../lib/format";

export function SignalBars({ rssi }) {
  const n = rssiBars(rssi);
  return (
    <span className="bars" aria-label={`Signal ${n} of 4`}>
      {[1, 2, 3, 4].map((i) => <i key={i} className={i <= n ? "on" : ""} style={{ height: 4 + i * 3 }} />)}
    </span>
  );
}

function statusLine(d) {
  if (d.status === "reached") return { text: `${d.assignedTeam} arrived`, cls: "ok" };
  if (d.status === "queued") return { text: `${d.assignedTeam} next, arrives in ${fmtDuration(d.etaSeconds)}`, cls: "wait" };
  if (d.assignedTeam) return { text: `${d.assignedTeam} on the way, ${fmtDuration(d.etaSeconds)}`, cls: "go" };
  if (d.verdict === "HIGH") return { text: "Needs a team", cls: "warn" };
  return null;
}

export function DetectionCard({ d, active, onClick }) {
  const v = VERDICT[d.verdict] || VERDICT.NONE;
  const s = statusLine(d);
  return (
    <button className={`det ${active ? "active" : ""}`} onClick={onClick} style={{ "--tier": v.color }}>
      <span className="det-bar" />
      <span className="det-main">
        <span className="det-top">
          <b>{v.label}</b>
          <time>{fmtTime(d.timestamp)}</time>
        </span>
        <span className="det-metrics">
          {d.temp_c != null && <span>{Number(d.temp_c).toFixed(1)} °C</span>}
          {d.rssi != null && <span className="sig"><SignalBars rssi={d.rssi} /> {d.rssi} dBm</span>}
          {d.gas && <span className="flag danger">Gas</span>}
        </span>
        {s && <span className={`det-status ${s.cls}`}>{s.text}</span>}
      </span>
    </button>
  );
}

const FILTERS = [
  ["ALL", "All"],
  ["HIGH", "High"],
  ["UNASSIGNED", "Needs team"],
  ["LOW", "Low"],
  ["VETO", "Gas"],
];

export default function DetectionList({ detections, filter, setFilter, selectedId, onSelect }) {
  return (
    <>
      <div className="filters" role="tablist" aria-label="Filter detections">
        {FILTERS.map(([k, label]) => (
          <button key={k} className={`chip ${filter === k ? "on" : ""}`} onClick={() => setFilter(k)}>{label}</button>
        ))}
      </div>
      <div className="scroll list">
        {detections.length === 0 && (
          <div className="empty small">
            <p>No detections here yet.</p>
            <span>New readings from the pod show up the moment they arrive.</span>
          </div>
        )}
        {detections.map((d) => (
          <DetectionCard key={d.id} d={d} active={selectedId === d.id} onClick={() => onSelect(d)} />
        ))}
      </div>
    </>
  );
}

export function TeamsList({ teams, detections }) {
  return (
    <div className="scroll list">
      {teams.map((t) => {
        const color = t.color || TEAM_COLOR[t.id];
        const jobs = detections.filter((d) => d.assignedTeam === t.id && d.status !== "reached");
        const active = jobs.find((d) => d.status === "en_route");
        const done = detections.filter((d) => d.assignedTeam === t.id && d.status === "reached").length;
        return (
          <div className="team" key={t.id} style={{ "--team": color }}>
            <div className="team-head">
              <span className="avatar">{t.name[0]}</span>
              <div>
                <b>{t.name}</b>
                <span className="muted">{(t.members || []).join(", ")}</span>
              </div>
            </div>
            <div className="team-state">
              {active ? (
                <span className="det-status go">On the way, {fmtDuration(active.etaSeconds)} left</span>
              ) : (
                <span className="det-status">Available</span>
              )}
              <span className="muted">
                {jobs.length > 1 ? `${jobs.length - 1} queued · ` : ""}{done} reached
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
