import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { Suspense, lazy, useMemo } from "react";
import { useSimulation } from "@/hooks/useSimulation";
import { ThermalPreview } from "@/components/ThermalPreview";
import { DetectionList } from "@/components/DetectionList";
import { DetailPanel } from "@/components/DetailPanel";
import { LogTable } from "@/components/LogTable";
import {
  RESCUE_STATUSES,
  STATUS_HEX,
  STATUS_LABEL,
  TIER_HEX,
  TIER_LABEL,
  fmtClock,
  fmtDistance,
  fmtEta,
  fmtTime,
  type Detection,
  type Tier,
} from "@/lib/simulation";

const SiteMap = lazy(() => import("@/components/SiteMap"));

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "RSSI Rescue Pod — Live Search Dashboard" },
      {
        name: "description",
        content:
          "Operational dashboard for the RSSI-Based Rescue and Research Pod: live sweep map, sensor-fusion verdicts, thermal preview and exportable session log.",
      },
      { property: "og:title", content: "RSSI Rescue Pod — Live Search Dashboard" },
      {
        property: "og:description",
        content:
          "Simulated search-and-rescue sensor fusion: signal, body heat and flame veto, ranked on a live site map.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function toCsv(rows: Detection[]) {
  const head = [
    "id",
    "timestamp_iso",
    "lat",
    "lng",
    "rssi_dbm",
    "probe_source",
    "peak_temp_c",
    "ambient_c",
    "flame",
    "verdict",
    "confidence",
    "rescue_status",
    "team_note",
  ].join(",");
  const body = rows.map((d) =>
    [
      d.id,
      new Date(d.t).toISOString(),
      d.lat.toFixed(6),
      d.lng.toFixed(6),
      d.rssi,
      d.mac,
      d.peakTempC.toFixed(1),
      d.ambientTempC.toFixed(1),
      d.flame ? "ACTIVE" : "CLEAR",
      d.tier,
      d.score,
      d.status,
      `"${d.logNote.replace(/"/g, '""')}"`,
    ].join(","),
  );
  return [head, ...body].join("\n");
}

function Dashboard() {
  const sim = useSimulation();
  const selected = useMemo(
    () => sim.detections.find((d) => d.id === sim.selectedId) ?? null,
    [sim.detections, sim.selectedId],
  );

  const tiers: Tier[] = ["HIGH", "LOW", "NOT_REPORTED", "VETO"];
  const statuses = RESCUE_STATUSES;
  const finished = sim.progress >= 1;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-[900] flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-border bg-card px-4 py-2.5">
        <div className="flex items-center gap-3">
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{
              backgroundColor: sim.running ? TIER_HEX.HIGH : "var(--color-muted-foreground)",
              boxShadow: sim.running ? `0 0 10px ${TIER_HEX.HIGH}` : undefined,
            }}
          />
          <div>
            <h1 className="font-mono text-sm font-semibold tracking-[0.2em]">
              RSSI RESCUE &amp; RESEARCH POD
            </h1>
            <p className="label-xs">Field operations console · POD-01 · sector delta</p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => sim.setRunning(!sim.running)}
            disabled={finished}
            className="rounded-sm bg-primary px-4 py-1.5 font-mono text-xs font-semibold tracking-widest text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {sim.running ? "PAUSE SCAN" : finished ? "SWEEP COMPLETE" : "START SCAN"}
          </button>
          <button
            type="button"
            onClick={sim.reset}
            className="rounded-sm border border-border px-4 py-1.5 font-mono text-xs tracking-widest text-foreground transition-colors hover:bg-secondary"
          >
            RESET
          </button>
        </div>
      </header>

      <main className="flex flex-col gap-3 p-3">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[18rem_minmax(0,1fr)_20rem]">
          {/* LEFT: status + thermal */}
          <aside className="flex flex-col gap-3">
            <section className="panel-surface p-3">
              <h2 className="label-xs mb-2">Scan status</h2>
              <div className="grid grid-cols-2 gap-2">
                <Stat label="Elapsed" value={fmtClock(sim.elapsed)} />
                <Stat label="Sweep" value={`${Math.round(sim.progress * 100)}%`} />
                <Stat label="Ground covered" value={`${Math.round(sim.metersCovered)} m`} />
                <Stat label="Readings" value={String(sim.detections.length)} />
              </div>
              <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full bg-primary transition-[width] duration-200"
                  style={{ width: `${sim.progress * 100}%` }}
                />
              </div>
            </section>

            <section className="panel-surface p-3">
              <h2 className="label-xs mb-2">Verdict breakdown</h2>
              <div className="space-y-1.5">
                {tiers.map((t) => (
                  <div key={t} className="flex items-center gap-2">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: TIER_HEX[t] }}
                    />
                    <span className="flex-1 font-mono text-[0.68rem] tracking-wider">
                      {TIER_LABEL[t]}
                    </span>
                    <span className="font-mono text-sm" style={{ color: TIER_HEX[t] }}>
                      {sim.counts[t]}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <section className="panel-surface p-3">
              <h2 className="label-xs mb-2">Thermal preview</h2>
              <ThermalPreview frame={sim.frame} live={sim.running} />
            </section>
          </aside>

          {/* CENTER: map + rescue team */}
          <div className="flex flex-col gap-3">
            <section className="panel-surface relative h-[24rem] overflow-hidden">
              <ClientOnly
                fallback={
                  <div className="flex h-full items-center justify-center font-mono text-xs text-muted-foreground">
                    INITIALISING SITE MAP…
                  </div>
                }
              >
                <Suspense
                  fallback={
                    <div className="flex h-full items-center justify-center font-mono text-xs text-muted-foreground">
                      LOADING TILES…
                    </div>
                  }
                >
                  <SiteMap
                    path={sim.path}
                    pod={sim.pod}
                    progress={sim.progress}
                    running={sim.running}
                    detections={sim.detections}
                    selectedId={sim.selectedId}
                    onSelect={sim.setSelectedId}
                    rescuer={sim.rescuer}
                    target={sim.target}
                  />
                </Suspense>
              </ClientOnly>
              <div className="pointer-events-none absolute bottom-3 left-3 z-[500] rounded-sm border border-border bg-card/90 px-3 py-1.5">
                <p className="label-xs">Pod telemetry</p>
                <p className="font-mono text-[0.68rem]">
                  {sim.pod.lat.toFixed(5)}, {sim.pod.lng.toFixed(5)} · HDG{" "}
                  {((sim.pod.heading + 360) % 360).toFixed(0).padStart(3, "0")}°
                </p>
              </div>
            </section>

            <section className="panel-surface p-3">
              <h2 className="label-xs mb-2">Rescue team alpha</h2>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Stat
                  label="Team position"
                  value={`${sim.rescuer.lat.toFixed(4)}, ${sim.rescuer.lng.toFixed(4)}`}
                />
                <Stat label="Tasked to" value={sim.target ? sim.target.id : "—"} />
                <Stat
                  label="Distance"
                  value={sim.rescuerDistance != null ? fmtDistance(sim.rescuerDistance) : "—"}
                />
                <Stat
                  label="ETA on foot"
                  value={sim.rescuerDistance != null ? fmtEta(sim.rescuerDistance) : "--:--"}
                />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={!sim.selectedId}
                  onClick={() => sim.selectedId && sim.dispatchTeam(sim.selectedId)}
                  className="rounded-sm bg-primary px-3 py-1.5 font-mono text-[0.65rem] tracking-widest text-primary-foreground disabled:opacity-40"
                >
                  SEND TEAM TO SELECTED
                </button>
                <button
                  type="button"
                  disabled={!sim.target}
                  onClick={() => sim.target && sim.setStatus(sim.target.id, "RESCUED")}
                  className="rounded-sm border px-3 py-1.5 font-mono text-[0.65rem] tracking-widest disabled:opacity-40"
                  style={{ borderColor: STATUS_HEX.RESCUED, color: STATUS_HEX.RESCUED }}
                >
                  MARK RESCUED
                </button>
                <button
                  type="button"
                  disabled={!sim.target}
                  onClick={() => sim.target && sim.setStatus(sim.target.id, "NOT_FOUND")}
                  className="rounded-sm border px-3 py-1.5 font-mono text-[0.65rem] tracking-widest disabled:opacity-40"
                  style={{ borderColor: STATUS_HEX.NOT_FOUND, color: STATUS_HEX.NOT_FOUND }}
                >
                  MARK NOTHING FOUND
                </button>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                {statuses.map((s) => (
                  <span key={s} className="font-mono text-[0.65rem]">
                    <span style={{ color: STATUS_HEX[s] }}>{STATUS_LABEL[s]}</span>{" "}
                    {sim.statusCounts[s]}
                  </span>
                ))}
              </div>
            </section>
          </div>

          {/* RIGHT: ranked list + detail */}
          <aside className="flex flex-col gap-3">
            <section className="panel-surface flex max-h-[24rem] flex-col overflow-hidden">
              <h2 className="label-xs border-b border-border px-3 py-2">
                Ranked detections ({sim.detections.length})
              </h2>
              <div className="min-h-0 flex-1 overflow-y-auto">
                <DetectionList
                  detections={sim.detections}
                  selectedId={sim.selectedId}
                  onSelect={sim.setSelectedId}
                />
              </div>
            </section>
            <section className="panel-surface overflow-hidden">
              <h2 className="label-xs border-b border-border px-3 py-2">Reading detail</h2>
              <DetailPanel detection={selected} />
            </section>
          </aside>
        </div>

        {/* LIVE SESSION LOG */}
        <section className="panel-surface overflow-hidden">
          <div className="flex flex-wrap items-center gap-3 border-b border-border px-3 py-2">
            <h2 className="label-xs">Live session log ({sim.detections.length} entries)</h2>
            <p className="font-mono text-[0.65rem] text-muted-foreground">
              {sim.detections.length ? fmtTime(sim.detections[0]!.t) : "--:--:--"} →{" "}
              {sim.detections.length
                ? fmtTime(sim.detections[sim.detections.length - 1]!.t)
                : "--:--:--"}
            </p>
            <div className="ml-auto flex gap-2">
              <button
                type="button"
                disabled={!sim.detections.length}
                onClick={() =>
                  download(`rescue-pod-session-${Date.now()}.csv`, toCsv(sim.detections), "text/csv")
                }
                className="rounded-sm border border-border px-3 py-1.5 font-mono text-[0.65rem] tracking-widest transition-colors hover:bg-secondary disabled:opacity-40"
              >
                EXPORT CSV
              </button>
              <button
                type="button"
                disabled={!sim.detections.length}
                onClick={() =>
                  download(
                    `rescue-pod-session-${Date.now()}.json`,
                    JSON.stringify(sim.detections, null, 2),
                    "application/json",
                  )
                }
                className="rounded-sm border border-border px-3 py-1.5 font-mono text-[0.65rem] tracking-widest transition-colors hover:bg-secondary disabled:opacity-40"
              >
                EXPORT JSON
              </button>
            </div>
          </div>
          <div className="max-h-[22rem] overflow-y-auto">
            <LogTable
              detections={sim.detections}
              selectedId={sim.selectedId}
              onSelect={sim.setSelectedId}
              onStatus={sim.setStatus}
              onNote={(id, note) => sim.updateDetection(id, { logNote: note })}
              onDispatch={sim.dispatchTeam}
              rescuer={sim.rescuer}
              targetId={sim.targetId}
            />
          </div>
        </section>
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-sm border border-border bg-card px-2 py-1.5">
      <p className="label-xs">{label}</p>
      <p className="truncate font-mono text-base">{value}</p>
    </div>
  );
}
