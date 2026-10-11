import { useEffect, useState } from "react";
import { API, VERDICT, LOCATION_COPY, fmtTime, fmtDuration, fmtDistance } from "../lib/format";
import { SignalBars } from "./DetectionList";

function Reading({ label, value, children }) {
  return (
    <div className="reading">
      <span className="muted">{label}</span>
      <b>{children || value}</b>
    </div>
  );
}

function Flag({ on, label, danger }) {
  return <span className={`flag ${on ? (danger ? "danger" : "on") : "off"}`}>{label}</span>;
}

/* ---------- Dispatch: ranks every team by arrival time ---------- */
function Dispatch({ selected, headers, teams, notes, setNotes, onAssigned }) {
  const [options, setOptions] = useState(null);
  const [choice, setChoice] = useState(selected.assignedTeam || "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    setOptions(null);
    fetch(`${API}/api/detections/${selected.id}/options`, { headers })
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        setOptions(d.options || []);
        setChoice((c) => c || selected.assignedTeam || d.options?.[0]?.team || "");
      })
      .catch(() => alive && setOptions([]));
    return () => { alive = false; };
    // re-rank whenever the target moves or its assignment changes
  }, [selected.id, selected.lat, selected.lng, selected.assignedTeam, headers]);

  useEffect(() => { setChoice(selected.assignedTeam || ""); }, [selected.id]);

  async function assign(team) {
    setBusy(true);
    try {
      const res = await fetch(`${API}/api/detections/${selected.id}/assign`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ team: team || null, notes }),
      });
      const data = await res.json();
      if (res.ok) onAssigned(data.detection);
    } finally {
      setBusy(false);
    }
  }

  const done = selected.status === "reached";
  const ready = options && options.length > 0;

  return (
    <section className="block">
      <div className="block-head">
        <h3>Send a team</h3>
        {ready && <span className="muted">Ranked by arrival time</span>}
      </div>

      {!options && (
        <div className="skeletons" aria-busy="true">
          <i /><i /><i />
        </div>
      )}

      {ready && (
        <div className="options" role="radiogroup" aria-label="Response team">
          {options.map((o) => {
            return (
              <label key={o.team} className={`option ${choice === o.team ? "on" : ""}`} style={{ "--team": o.color }}>
                <input type="radio" name="team" checked={choice === o.team} onChange={() => setChoice(o.team)} />
                <span className="avatar">{o.team[0]}</span>
                <span className="option-body">
                  <b>{o.team} {o.fastest && <em className="badge">Fastest</em>}</b>
                  <span className="muted">
                    {fmtDistance(o.distanceMeters)} away
                    {o.queued > 0 ? ` · finishing ${o.queued} job${o.queued > 1 ? "s" : ""} first` : ""}
                  </span>
                </span>
                <span className="option-eta">{fmtDuration(o.etaSeconds)}</span>
              </label>
            );
          })}
        </div>
      )}

      {options && options.length > 0 && options[0].routeSource === "straight" && (
        <p className="note warn">Road routing isn't reachable right now, so times are straight-line estimates.</p>
      )}

      <textarea
        placeholder="Notes for the team, such as access point or hazards"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={2}
      />

      <div className="row-actions">
        <button
          className="btn primary grow"
          disabled={busy || !choice || (choice === selected.assignedTeam && !done && notes === (selected.notes || ""))}
          onClick={() => assign(choice)}
        >
          {busy ? "Planning route…" : selected.assignedTeam && choice !== selected.assignedTeam ? `Reassign to ${choice}` : selected.assignedTeam ? "Update notes" : `Send ${choice || "team"}`}
        </button>
        {selected.assignedTeam && (
          <button className="btn" disabled={busy} onClick={() => assign(null)}>Recall</button>
        )}
      </div>
    </section>
  );
}

/* ---------- Route progress ---------- */
function RouteCard({ d }) {
  if (!d.assignedTeam) return null;
  if (d.status === "reached") {
    return (
      <section className="route-card ok">
        <b>{d.assignedTeam} arrived</b>
        <span className="muted">{d.reachedAt ? fmtTime(d.reachedAt) : ""}</span>
      </section>
    );
  }
  const pct = d.distanceMeters ? Math.max(0, Math.min(100, (1 - (d.remainingMeters ?? d.distanceMeters) / d.distanceMeters) * 100)) : 0;
  const queued = d.status === "queued";
  return (
    <section className="route-card">
      <div className="route-top">
        <div>
          <b>{queued ? `${d.assignedTeam} is next in line` : `${d.assignedTeam} on the way`}</b>
          <span className="muted">Sent by {d.assignedBy}</span>
        </div>
        <div className="eta">
          <strong>{fmtDuration(d.etaSeconds)}</strong>
          <span className="muted">{queued ? "until arrival" : "left"}</span>
        </div>
      </div>
      {!queued && (
        <div className="progress" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
          <i style={{ width: `${pct}%` }} />
        </div>
      )}
      <div className="route-meta">
        <span>{fmtDistance(d.distanceMeters)} route</span>
        {d.routeSource === "road" && d.routeAlternatives > 1 && (
          <span>
            Quickest of {d.routeAlternatives} road routes
            {d.routeSavedSeconds >= 30 ? `, saves ${fmtDuration(d.routeSavedSeconds)}` : ""}
          </span>
        )}
        {d.routeSource === "straight" && <span className="warn-text">Straight-line estimate</span>}
      </div>
    </section>
  );
}

export default function DetailPanel({ selected, user, headers, teams, notes, setNotes, pickMode, setPickMode, onUpdated, onClose }) {
  if (!selected) {
    return (
      <div className="empty">
        <div className="empty-art" />
        <p>Select a detection</p>
        <span>Pick one from the list or tap a marker on the map to see readings and send a team.</span>
      </div>
    );
  }

  const v = VERDICT[selected.verdict] || VERDICT.NONE;
  const isAdmin = user.role === "admin";
  const canDispatch = isAdmin && selected.verdict === "HIGH" && selected.status !== "reached";

  return (
    <div className="detail scroll">
      <header className="detail-head" style={{ "--tier": v.color }}>
        <span className="tier-pill">{v.label}</span>
        <time>{new Date(selected.timestamp).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</time>
        <button className="icon-btn" onClick={onClose} aria-label="Close details">×</button>
      </header>

      <div className="readings">
        <Reading label="Temperature" value={selected.temp_c != null ? `${Number(selected.temp_c).toFixed(1)} °C` : "—"} />
        <Reading label="Phone signal">
          {selected.rssi != null ? <><SignalBars rssi={selected.rssi} /> {selected.rssi} dBm</> : "—"}
        </Reading>
      </div>

      <div className="flags">
        <Flag on={selected.heat} label="Heat" />
        <Flag on={selected.phone} label="Phone" />
        <Flag on={selected.object} label="Object" />
        <Flag on={selected.gas} label="Gas" danger />
      </div>

      <RouteCard d={selected} />

      {canDispatch && (
        <Dispatch
          key={selected.id}
          selected={selected}
          headers={headers}
          teams={teams}
          notes={notes}
          setNotes={setNotes}
          onAssigned={onUpdated}
        />
      )}

      {!isAdmin && selected.notes && (
        <section className="block">
          <h3>Notes from command</h3>
          <p className="note">{selected.notes}</p>
        </section>
      )}

      <section className="block">
        <div className="block-head">
          <h3>Location</h3>
          <span className={`src src-${selected.locationSource}`}>{selected.locationSource}</span>
        </div>
        <p className="note">{LOCATION_COPY[selected.locationSource]}</p>
        <p className="coords">{selected.lat?.toFixed(5)}, {selected.lng?.toFixed(5)}</p>
        {isAdmin && (
          <button className={`btn full ${pickMode ? "active" : ""}`} onClick={() => setPickMode((p) => !p)}>
            {pickMode ? "Cancel, don't move it" : "Set position on map"}
          </button>
        )}
      </section>
    </div>
  );
}
