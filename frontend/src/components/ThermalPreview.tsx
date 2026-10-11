import { THERM_H, THERM_W, thermalColor } from "@/lib/simulation";

export function ThermalPreview({ frame, live }: { frame: number[]; live: boolean }) {
  const peak = frame.length ? Math.max(...frame) : 0;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="label-xs">MLX90640 · 32 × 24</span>
        <span className="font-mono text-[0.65rem] text-muted-foreground">
          PEAK {peak.toFixed(1)}°C {live ? "· LIVE" : "· IDLE"}
        </span>
      </div>
      <div
        className="grid overflow-hidden rounded-sm border border-border"
        style={{
          gridTemplateColumns: `repeat(${THERM_W}, 1fr)`,
          gridTemplateRows: `repeat(${THERM_H}, 1fr)`,
          aspectRatio: `${THERM_W} / ${THERM_H}`,
        }}
      >
        {frame.map((v, i) => (
          <div key={i} style={{ backgroundColor: thermalColor(v) }} />
        ))}
      </div>
      <div className="flex items-center gap-2">
        <span className="font-mono text-[0.6rem] text-muted-foreground">14°</span>
        <div
          className="h-1.5 flex-1 rounded-full"
          style={{
            background: `linear-gradient(90deg, ${[0, 0.25, 0.5, 0.75, 1]
              .map((t) => thermalColor(14 + t * 31))
              .join(",")})`,
          }}
        />
        <span className="font-mono text-[0.6rem] text-muted-foreground">45°+</span>
      </div>
    </div>
  );
}
