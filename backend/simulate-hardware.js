/**
 * Simulates the ESP8266 pod by sending random but realistic detections
 * to the backend every few seconds.
 *
 * Usage: node simulate-hardware.js
 */

const BACKEND = "http://localhost:4000/api/ingest";

const verdicts = ["HIGH", "LOW", "VETO", "NONE"];

function randomDetection() {
  const heat = Math.random() > 0.45;
  const phone = Math.random() > 0.4;
  const gas = Math.random() > 0.85;
  let verdict = "NONE";
  if (gas) verdict = "VETO";
  else if (heat) verdict = "HIGH";
  else if (phone) verdict = "LOW";

  return {
    temp_c: heat ? 30 + Math.random() * 7 : 22 + Math.random() * 5,
    rssi: phone ? -45 - Math.floor(Math.random() * 40) : -90 - Math.floor(Math.random() * 20),
    heat,
    phone,
    object: Math.random() > 0.7,
    gas,
    verdict,
    team: Math.random() > 0.5 ? "Alpha" : "Bravo",
    source: "simulator",
  };
}

async function tick() {
  const payload = randomDetection();
  try {
    const res = await fetch(BACKEND, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      console.log("→", payload.verdict, `temp=${payload.temp_c.toFixed(1)} phone=${payload.phone} gas=${payload.gas}`);
    } else {
      console.warn("Failed:", await res.text());
    }
  } catch (e) {
    console.warn("Backend not reachable:", e.message);
  }
}

console.log("Hardware simulator started. Sending detections every 3–5 s…");
tick();
setInterval(tick, 3000 + Math.random() * 2000);
