import {
  RESCUE_STATUSES,
  STATUS_HEX,
  STATUS_LABEL,
  TIER_HEX,
  fmtDistance,
  fmtTime,
  haversine,
  type Detection,
  type RescueStatus,
} from "@/lib/simulation";

interface Props {
  detections: Detection[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onStatus: (id: string, status: RescueStatus) => void;
  onNote: (id: string, note: string) => void;
  onDispatch: (id: string) => void;
  rescuer: { lat: number; lng: number };
  targetId: string | null;
}

export function LogTable({
  detections,
  selectedId,
  onSelect,
  onStatus,
  onNote,
  onDispatch,
  rescuer,
  targetId,
}: Props) {
  if (!detections.length) {
    return (
      <p className="px-3 py-8 text-center font-mono text-xs text-muted-foreground">
        Session log is empty. Every reading the pod takes will appear here live — the same rows
        the CSV export contains.
      </p>
    );
  }

  const rows = [...detections].sort((a, b) => b.t - a.t);

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[54rem] border-collapse font-mono text-[0.68rem]">
        <thead className="sticky top-0 z-10 bg-card">
          <tr className="border-b border-border text-left">
            {[
              "ID",
              "Time",
              "Verdict",
              "Conf",
              "RSSI",
              "Peak °C",
              "Flame",
              "Position",
              "Range",
              "Rescue status",
              "Team note",
            ].map((h) => (
              <th key={h} className="label-xs whitespace-nowrap px-2 py-1.5 font-normal">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((d) => {
            const active = d.id === selectedId;
            const range = haversine(rescuer, d);
            return (
              <tr
                key={d.id}
                onClick={() => onSelect(d.id)}
                className={`cursor-pointer border-b border-border/60 transition-colors hover:bg-secondary ${
                  active ? "bg-secondary" : ""
                }`}
              >
                <td className="whitespace-nowrap px-2 py-1.5">
                  <span
                    className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle"
                    style={{ backgroundColor: TIER_HEX[d.tier] }}
                  />
                  {d.id}
                </td>
                <td className="whitespace-nowrap px-2 py-1.5 text-muted-foreground">
                  {fmtTime(d.t)}
                </td>
                <td
                  className="whitespace-nowrap px-2 py-1.5 font-semibold"
                  style={{ color: TIER_HEX[d.tier] }}
                >
                  {d.tier.replace("_", " ")}
                </td>
                <td className="px-2 py-1.5">{d.score}</td>
                <td className="whitespace-nowrap px-2 py-1.5">{d.rssi}</td>
                <td className="px-2 py-1.5">{d.peakTempC.toFixed(1)}</td>
                <td className="px-2 py-1.5" style={{ color: d.flame ? TIER_HEX.VETO : undefined }}>
                  {d.flame ? "ACTIVE" : "CLEAR"}
                </td>
                <td className="whitespace-nowrap px-2 py-1.5 text-muted-foreground">
                  {d.lat.toFixed(5)}, {d.lng.toFixed(5)}
                </td>
                <td className="whitespace-nowrap px-2 py-1.5">
                  {fmtDistance(range)}
                  {targetId === d.id ? " ·EN ROUTE" : ""}
                </td>
                <td className="px-2 py-1.5">
                  <div className="flex items-center gap-1.5">
                    <select
                      value={d.status}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => onStatus(d.id, e.target.value as RescueStatus)}
                      className="rounded-sm border bg-card px-1.5 py-1 font-mono text-[0.65rem] outline-none"
                      style={{ borderColor: STATUS_HEX[d.status], color: STATUS_HEX[d.status] }}
                    >
                      {RESCUE_STATUSES.map((s) => (
                        <option key={s} value={s} className="text-foreground">
                          {STATUS_LABEL[s]}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDispatch(d.id);
                      }}
                      className="rounded-sm border border-border px-1.5 py-1 text-[0.6rem] tracking-widest hover:bg-secondary"
                    >
                      SEND TEAM
                    </button>
                  </div>
                </td>
                <td className="px-2 py-1.5">
                  <input
                    value={d.logNote}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => onNote(d.id, e.target.value)}
                    placeholder="e.g. child pulled from void 3"
                    className="w-52 rounded-sm border border-border bg-card px-2 py-1 font-mono text-[0.65rem] outline-none focus:border-primary"
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
