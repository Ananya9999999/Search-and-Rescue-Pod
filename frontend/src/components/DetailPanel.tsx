import {
  RSSI_THRESHOLD,
  STATUS_LABEL,
  TIER_HEX,
  TIER_LABEL,
  fmtTime,
  type Detection,
} from "@/lib/simulation";

export function DetailPanel({ detection }: { detection: Detection | null }) {
  if (!detection) {
    return (
      <div className="px-3 py-6 text-center font-mono text-xs text-muted-foreground">
        Select a detection to inspect its raw sensor readings.
      </div>
    );
  }
  const d = detection;
  const rows: [string, string][] = [
    ["Detection ID", d.id],
    ["Logged", fmtTime(d.t)],
    ["Position", `${d.lat.toFixed(5)}, ${d.lng.toFixed(5)}`],
    ["Probe source", d.mac],
    ["Signal strength", `${d.rssi} dBm (threshold ${RSSI_THRESHOLD} dBm)`],
    ["Signal verdict", d.rssi > RSSI_THRESHOLD ? "HANDSET PRESENT" : "NO USABLE SIGNAL"],
    ["Peak thermal", `${d.peakTempC.toFixed(1)} °C`],
    ["Ambient", `${d.ambientTempC.toFixed(1)} °C`],
    [
      "Human band 30–38°C",
      d.peakTempC >= 30 && d.peakTempC <= 38 ? "CLUSTER CONFIRMED" : "NO CLUSTER",
    ],
    ["Flame sensor", d.flame ? "ACTIVE — 760–1100 nm" : "CLEAR"],
    ["Fusion confidence", `${d.score} %`],
    ["Rescue status", STATUS_LABEL[d.status]],
    ["Team note", d.logNote || "—"],
  ];

  return (
    <div className="space-y-3 p-3">
      <div
        className="rounded-sm border px-3 py-2"
        style={{
          borderColor: TIER_HEX[d.tier],
          backgroundColor: `color-mix(in oklab, ${TIER_HEX[d.tier]} 12%, transparent)`,
        }}
      >
        <p className="label-xs">Final verdict</p>
        <p
          className="font-mono text-sm font-semibold tracking-wider"
          style={{ color: TIER_HEX[d.tier] }}
        >
          {TIER_LABEL[d.tier]}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{d.note}</p>
      </div>
      <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-sm border border-border bg-border">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-3 bg-card px-3 py-1.5">
            <dt className="label-xs">{k}</dt>
            <dd className="font-mono text-[0.7rem] text-foreground">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
