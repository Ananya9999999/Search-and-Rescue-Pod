/**
 * Serial → Backend bridge
 * Reads JSON lines from the NodeMCU and POSTs them to /api/ingest
 *
 * Usage:
 *   node serial-bridge.js [COM_PORT]
 *   Example Windows: node serial-bridge.js COM3
 *   Example Linux:   node serial-bridge.js /dev/ttyUSB0
 */

import { SerialPort } from "serialport";
import { ReadlineParser } from "@serialport/parser-readline";

const PORT_PATH = process.argv[2] || "COM3";
const BACKEND = "http://localhost:4000/api/ingest";
const BAUD = 115200;

console.log(`Opening serial port ${PORT_PATH} @ ${BAUD}...`);

const port = new SerialPort({ path: PORT_PATH, baudRate: BAUD });
const parser = port.pipe(new ReadlineParser({ delimiter: "\n" }));

port.on("open", () => {
  console.log("Serial port open. Forwarding JSON lines to backend...");
});

port.on("error", (err) => {
  console.error("Serial error:", err.message);
  console.log("\nMake sure:");
  console.log("  1. The correct COM port is passed");
  console.log("  2. Arduino IDE Serial Monitor is CLOSED");
  console.log("  3. You ran: npm install  (in backend folder)");
});

parser.on("data", async (line) => {
  const raw = line.trim();
  if (!raw.startsWith("{")) {
    // debug / boot text – just print
    console.log("[serial]", raw);
    return;
  }

  try {
    const data = JSON.parse(raw);
    data.source = "serial";
    data.team = data.team || "Alpha";

    const res = await fetch(BACKEND, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (res.ok) {
      console.log("→", data.verdict, `temp=${data.temp_c ?? "?"} rssi=${data.rssi ?? "?"}`);
    } else {
      console.warn("Backend rejected:", await res.text());
    }
  } catch (e) {
    console.warn("Bad JSON or network:", e.message, "line:", raw.slice(0, 80));
  }
});
