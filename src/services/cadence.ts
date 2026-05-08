import { Accelerometer } from 'expo-sensors';

type CadenceCallback = (bpm: number) => void;

const SAMPLE_INTERVAL_MS = 80;
const HISTORY_SIZE = 30;
const STEP_HISTORY = 8;
const MIN_STEP_INTERVAL_MS = 250; // caps at ~240 SPM
const THRESHOLD_FACTOR = 1.18;

let subscription: ReturnType<typeof Accelerometer.addListener> | null = null;
let magnitudeHistory: number[] = [];
let stepTimes: number[] = [];
let lastStepTime = 0;
let prevWasPeak = false;

export function startCadenceDetection(onBPM: CadenceCallback): void {
  Accelerometer.setUpdateInterval(SAMPLE_INTERVAL_MS);

  subscription = Accelerometer.addListener(({ x, y, z }) => {
    const mag = Math.sqrt(x * x + y * y + z * z);
    magnitudeHistory.push(mag);
    if (magnitudeHistory.length > HISTORY_SIZE) magnitudeHistory.shift();

    const avg = magnitudeHistory.reduce((a, b) => a + b, 0) / magnitudeHistory.length;
    const now = Date.now();
    const isPeak = mag > avg * THRESHOLD_FACTOR;

    if (isPeak && !prevWasPeak && now - lastStepTime > MIN_STEP_INTERVAL_MS) {
      lastStepTime = now;
      stepTimes.push(now);
      if (stepTimes.length > STEP_HISTORY) stepTimes.shift();

      if (stepTimes.length >= 4) {
        const intervals: number[] = [];
        for (let i = 1; i < stepTimes.length; i++) {
          intervals.push(stepTimes[i] - stepTimes[i - 1]);
        }
        const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
        const bpm = Math.round(60000 / avgInterval);
        if (bpm >= 60 && bpm <= 220) onBPM(bpm);
      }
    }

    prevWasPeak = isPeak;
  });
}

export function stopCadenceDetection(): void {
  subscription?.remove();
  subscription = null;
  magnitudeHistory = [];
  stepTimes = [];
  lastStepTime = 0;
  prevWasPeak = false;
}
