import { useState } from "react";
import { API } from "../lib/format";

const DEMO = [
  { label: "Command center", username: "admin", password: "admin123" },
  { label: "Alpha team", username: "team1", password: "team123" },
  { label: "Bravo team", username: "team2", password: "team123" },
  { label: "Charlie team", username: "team3", password: "team123" },
];

function Radar() {
  return (
    <svg className="radar" viewBox="0 0 400 400" aria-hidden="true">
      <defs>
        <radialGradient id="rg" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#0e9f6e" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#0e9f6e" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="200" cy="200" r="190" fill="url(#rg)" />
      {[60, 110, 160, 190].map((r) => (
        <circle key={r} cx="200" cy="200" r={r} className="radar-ring" />
      ))}
      <line x1="10" y1="200" x2="390" y2="200" className="radar-axis" />
      <line x1="200" y1="10" x2="200" y2="390" className="radar-axis" />
      <circle cx="200" cy="200" r="14" className="radar-pulse" />
      <circle cx="200" cy="200" r="6" className="radar-core" />
      <circle cx="268" cy="144" r="5" className="radar-blip" />
      <circle cx="132" cy="250" r="4" className="radar-blip dim" />
    </svg>
  );
}

export default function Login({ onLogin }) {
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
      if (!res.ok) throw new Error(data.error || "Sign-in failed");
      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
      onLogin(data.user, data.token);
    } catch (err) {
      setError(err.message === "Failed to fetch" ? "Can't reach the server. Is the backend running on port 4000?" : err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login">
      <section className="login-form-side">
        <div className="login-brand">
          <span className="mark">R</span>
          <span>Rescue Pod</span>
        </div>

        <form className="login-form" onSubmit={submit}>
          <h1>Find people faster.</h1>
          <p className="login-lede">
            Live heat, phone-signal and gas readings from the pod, with the quickest team route to every survivor signal.
          </p>

          {error && <div className="form-error" role="alert">{error}</div>}

          <label htmlFor="u">Username</label>
          <input id="u" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoFocus />
          <label htmlFor="p">Password</label>
          <input id="p" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          <button className="btn primary full" type="submit" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </button>

          <div className="demo-accounts">
            <span>Demo accounts</span>
            <div>
              {DEMO.map((d) => (
                <button
                  type="button"
                  key={d.username}
                  className={`chip ${username === d.username ? "on" : ""}`}
                  onClick={() => { setUsername(d.username); setPassword(d.password); }}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>
        </form>
      </section>

      <section className="login-art-side" aria-hidden="true">
        <Radar />
        <div className="art-caption">
          <strong>-58 dBm</strong>
          <span>Phone signal found under debris, 34.1 °C heat alongside it.</span>
        </div>
      </section>
    </div>
  );
}
