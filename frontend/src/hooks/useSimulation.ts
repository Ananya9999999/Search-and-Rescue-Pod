import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildSweepPath,
  haversine,
  makeDetection,
  pathLengthMeters,
  positionAt,
  idleFrame,
  thermalFrame,
  RESCUER_START,
  type Detection,
  type RescueStatus,
  type Tier,
} from "@/lib/simulation";

const TICK_MS = 100;
const SWEEP_SECONDS = 200;

export function useSimulation() {
  const path = useMemo(() => buildSweepPath(), []);
  const totalMeters = useMemo(() => pathLengthMeters(path), [path]);

  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [frame, setFrame] = useState<number[]>(() =>
    idleFrame(),
  );

  const [rescuer, setRescuer] = useState({ ...RESCUER_START });
  const [targetId, setTargetId] = useState<string | null>(null);

  const nextEventAt = useRef(2200);
  const seq = useRef(0);
  const phase = useRef(0);
  const heat = useRef({ hot: false, flame: false, until: 0 });

  const pod = useMemo(() => positionAt(path, progress), [path, progress]);
  const podRef = useRef(pod);
  podRef.current = pod;

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      phase.current += 1;
      setElapsed((e) => {
        const next = e + TICK_MS;
        if (next >= nextEventAt.current) {
          nextEventAt.current = next + 1800 + Math.random() * 2600;
          seq.current += 1;
          const det = makeDetection(seq.current, podRef.current);
          heat.current = {
            hot: det.tier === "HIGH" || (det.tier === "VETO" && det.peakTempC < 60),
            flame: det.flame,
            until: next + 3000,
          };
          setDetections((d) => [...d, det]);
        }
        if (next > heat.current.until) heat.current = { hot: false, flame: false, until: 0 };
        return next;
      });
      setProgress((p) => Math.min(p + TICK_MS / (SWEEP_SECONDS * 1000), 1));
      if (phase.current % 3 === 0) {
        setFrame(
          thermalFrame({ hot: heat.current.hot, flame: heat.current.flame, phase: phase.current }),
        );
      }
    }, TICK_MS);
    return () => clearInterval(id);
  }, [running]);

  useEffect(() => {
    if (progress >= 1 && running) setRunning(false);
  }, [progress, running]);

  // Rescue team walks toward its tasked detection.
  const target = useMemo(
    () => detections.find((d) => d.id === targetId) ?? null,
    [detections, targetId],
  );
  const targetRef = useRef(target);
  targetRef.current = target;

  useEffect(() => {
    if (!target) return;
    const id = setInterval(() => {
      const tg = targetRef.current;
      if (!tg) return;
      setRescuer((r) => {
        const dist = haversine(r, tg);
        if (dist < 3) return r;
        const step = Math.min(1.4 / dist, 1); // ~14 m/s sim pace
        return {
          lat: r.lat + (tg.lat - r.lat) * step,
          lng: r.lng + (tg.lng - r.lng) * step,
        };
      });
    }, TICK_MS);
    return () => clearInterval(id);
  }, [target]);

  const updateDetection = useCallback((id: string, patch: Partial<Detection>) => {
    setDetections((list) => list.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  }, []);

  const setStatus = useCallback(
    (id: string, status: RescueStatus) => {
      updateDetection(id, { status });
      if (status === "DISPATCHED") setTargetId(id);
      else setTargetId((t) => (t === id ? null : t));
    },
    [updateDetection],
  );

  const dispatchTeam = useCallback(
    (id: string) => setStatus(id, "DISPATCHED"),
    [setStatus],
  );

  const reset = useCallback(() => {
    setRunning(false);
    setProgress(0);
    setElapsed(0);
    setDetections([]);
    setSelectedId(null);
    setTargetId(null);
    setRescuer({ ...RESCUER_START });
    seq.current = 0;
    nextEventAt.current = 2200;
    heat.current = { hot: false, flame: false, until: 0 };
    setFrame(idleFrame());
  }, []);

  const counts = useMemo(() => {
    const c: Record<Tier, number> = { HIGH: 0, LOW: 0, NOT_REPORTED: 0, VETO: 0 };
    for (const d of detections) c[d.tier] += 1;
    return c;
  }, [detections]);

  const statusCounts = useMemo(() => {
    const c: Record<RescueStatus, number> = {
      PENDING: 0,
      DISPATCHED: 0,
      RESCUED: 0,
      NOT_FOUND: 0,
    };
    for (const d of detections) c[d.status] += 1;
    return c;
  }, [detections]);

  const rescuerDistance = target ? haversine(rescuer, target) : null;

  return {
    path,
    pod,
    running,
    setRunning,
    progress,
    elapsed,
    detections,
    counts,
    statusCounts,
    selectedId,
    setSelectedId,
    frame,
    reset,
    rescuer,
    target,
    targetId,
    rescuerDistance,
    dispatchTeam,
    setStatus,
    updateDetection,
    metersCovered: totalMeters * progress,
    totalMeters,
  };
}
