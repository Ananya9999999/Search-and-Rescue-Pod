import { useEffect, useRef, useState } from "react";
import { TEAM_COLOR, fmtTime } from "../lib/format";

const RECIPIENTS = ["Alpha", "Bravo", "Charlie", "Delta", "HQ"];

export default function ChatPanel({ user, messages, onSend }) {
  const [text, setText] = useState("");
  const [toTeam, setToTeam] = useState("");
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function submit(e) {
    e.preventDefault();
    if (!text.trim()) return;
    onSend(text.trim(), toTeam || null);
    setText("");
  }

  return (
    <div className="chat">
      <div className="chat-log">
        {messages.length === 0 && (
          <div className="empty small">
            <p>No messages yet.</p>
            <span>Messages go to every team unless you pick one.</span>
          </div>
        )}
        {messages.map((m) => {
          const mine = m.from === user.username;
          return (
            <div key={m.id} className={`msg ${mine ? "mine" : ""}`}>
              <div className="msg-meta">
                <span className="dot" style={{ background: TEAM_COLOR[m.team] || "#64748b" }} />
                <b>{m.fromName}</b>
                {m.toTeam && <span className="to">to {m.toTeam}</span>}
                <time>{fmtTime(m.timestamp)}</time>
              </div>
              <p>{m.text}</p>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
      <form className="chat-form" onSubmit={submit}>
        <select value={toTeam} onChange={(e) => setToTeam(e.target.value)} aria-label="Send to">
          <option value="">Everyone</option>
          {RECIPIENTS.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a message" maxLength={500} />
        <button className="btn primary" type="submit" disabled={!text.trim()}>Send</button>
      </form>
    </div>
  );
}
