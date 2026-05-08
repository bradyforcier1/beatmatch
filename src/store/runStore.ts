import { create } from 'zustand';
import { SpotifyTrack } from '../services/spotify';

type RunStore = {
  isRunning: boolean;
  isTestMode: boolean;
  currentBPM: number;
  currentTrack: SpotifyTrack | null;
  trackTempo: number | null;
  accessToken: string | null;
  refreshToken: string | null;
  tokenExpiry: number;
  deviceId: string | null;

  setRunning: (v: boolean) => void;
  setTestMode: (v: boolean) => void;
  setCurrentBPM: (bpm: number) => void;
  setCurrentTrack: (track: SpotifyTrack | null) => void;
  setTrackTempo: (bpm: number | null) => void;
  setTokens: (access: string, refresh: string, expiresIn: number) => void;
  setDeviceId: (id: string) => void;
  clearAuth: () => void;
};

export const useRunStore = create<RunStore>((set) => ({
  isRunning: false,
  isTestMode: false,
  currentBPM: 0,
  currentTrack: null,
  trackTempo: null,
  accessToken: null,
  refreshToken: null,
  tokenExpiry: 0,
  deviceId: null,

  setRunning: (v) => set({ isRunning: v }),
  setTestMode: (v) => set({ isTestMode: v }),
  setCurrentBPM: (bpm) => set({ currentBPM: bpm }),
  setCurrentTrack: (track) => set({ currentTrack: track }),
  setTrackTempo: (bpm) => set({ trackTempo: bpm }),
  setTokens: (access, refresh, expiresIn) =>
    set({ accessToken: access, refreshToken: refresh, tokenExpiry: Date.now() + expiresIn * 1000 }),
  setDeviceId: (id) => set({ deviceId: id }),
  clearAuth: () => set({ accessToken: null, refreshToken: null, tokenExpiry: 0 }),
}));
