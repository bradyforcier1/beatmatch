import { useEffect, useRef, useCallback } from 'react';
import { startCadenceDetection, stopCadenceDetection } from '../services/cadence';
import { useRunStore } from '../store/runStore';

const SMOOTHING_WINDOW = 5;
const SIGNIFICANT_CHANGE_THRESHOLD = 10;

// Simulated BPM oscillates 155 → 175 → 155 over a 30s cycle
const SIM_INTERVAL_MS = 500;
const SIM_CYCLE_MS = 30_000;
const SIM_BPM_LOW = 155;
const SIM_BPM_HIGH = 175;

function simulatedBPM(elapsed: number): number {
  const t = (elapsed % SIM_CYCLE_MS) / SIM_CYCLE_MS;
  const base = t < 0.5
    ? SIM_BPM_LOW + (t * 2) * (SIM_BPM_HIGH - SIM_BPM_LOW)
    : SIM_BPM_HIGH - ((t - 0.5) * 2) * (SIM_BPM_HIGH - SIM_BPM_LOW);
  return Math.round(base + (Math.random() - 0.5) * 3);
}

export function useCadence(onSignificantChange?: (bpm: number) => void) {
  const { isRunning, isTestMode, setCurrentBPM } = useRunStore();
  const recentBPMs = useRef<number[]>([]);
  const lastReportedBPM = useRef(0);

  const callbackRef = useRef(onSignificantChange);
  callbackRef.current = onSignificantChange;

  const handleRawBPM = useCallback((raw: number) => {
    recentBPMs.current.push(raw);
    if (recentBPMs.current.length > SMOOTHING_WINDOW) recentBPMs.current.shift();

    const smoothed = Math.round(
      recentBPMs.current.reduce((a, b) => a + b, 0) / recentBPMs.current.length
    );
    setCurrentBPM(smoothed);

    if (
      callbackRef.current &&
      lastReportedBPM.current !== 0 &&
      Math.abs(smoothed - lastReportedBPM.current) >= SIGNIFICANT_CHANGE_THRESHOLD
    ) {
      lastReportedBPM.current = smoothed;
      callbackRef.current(smoothed);
    } else if (lastReportedBPM.current === 0) {
      lastReportedBPM.current = smoothed;
    }
  }, [setCurrentBPM]);

  useEffect(() => {
    if (!isRunning) {
      stopCadenceDetection();
      setCurrentBPM(0);
      return () => {};
    }

    recentBPMs.current = [];
    lastReportedBPM.current = 0;

    if (isTestMode) {
      const start = Date.now();
      const id = setInterval(() => {
        handleRawBPM(simulatedBPM(Date.now() - start));
      }, SIM_INTERVAL_MS);
      return () => clearInterval(id);
    }

    startCadenceDetection(handleRawBPM);
    return () => stopCadenceDetection();
  }, [isRunning, isTestMode, handleRawBPM]);
}
