import {
  STATUS_HEX,
  STATUS_LABEL,
  TIER_HEX,
  TIER_LABEL,
  TIER_ORDER,
  fmtTime,
  type Detection,
} from "@/lib/simulation";

export function DetectionList({
  detections,
  selectedId,
  onSelect,
}: {
  detections: Detection[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const ranked = [...detections].sort(
    (a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier] || b.score - a.score || b.t - a.t,
  );

  if (!ranked.length) {
    return (
      <p className="px-3 py-6 text-center font-mono text-xs text-muted-foreground">
        No readings yet. Start a scan to begin the sweep.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border">
      {ranked.map((d) => {
        const active = d.id === selectedId;
        return (
          <li key={d.id}>
            <button
              type="button"
              onClick={() => onSelect(d.id)}
              className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-secondary ${
                active ? "bg-secondary" : ""
              }`}
              style={active ? { boxShadow: `inset 3px 0 0 ${TIER_HEX[d.tier]}` } : undefined}
            >
              <span
                className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: TIER_HEX[d.tier] }}
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span
                    className="font-mono text-[0.7rem] font-semibold tracking-wider"
                    style={{ color: TIER_HEX[d.tier] }}
                  >
                    {TIER_LABEL[d.tier]}
                  </span>
                  <span className="ml-auto font-mono text-[0.65rem] text-muted-foreground">
                    {d.score}%
                  </span>
                </span>
                <span className="block font-mono text-[0.65rem] text-muted-foreground">
                  {d.id} · {fmtTime(d.t)} · {d.rssi} dBm · {d.peakTempC.toFixed(1)}°C
                </span>
                <span
                  className="mt-1 inline-block rounded-sm border px-1.5 py-0.5 font-mono text-[0.58rem] tracking-widest"
                  style={{ borderColor: STATUS_HEX[d.status], color: STATUS_HEX[d.status] }}
                >
                  {STATUS_LABEL[d.status]}
                </span>
                {d.logNote ? (
                  <span className="mt-1 block truncate font-mono text-[0.6rem] text-muted-foreground">
                    “{d.logNote}”
                  </span>
                ) : null}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
