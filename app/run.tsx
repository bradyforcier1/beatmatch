import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Image,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import { useRunStore } from '../src/store/runStore';
import { useCadence } from '../src/hooks/useCadence';
import { useSpotify } from '../src/hooks/useSpotify';
import {
  getRecommendations,
  getPlaybackState,
  getTrackTempo,
  setVolume,
  skipToNext,
  previousTrack,
  pausePlayback,
  resumePlayback,
  addToQueue,
  SpotifyTrack,
} from '../src/services/spotify';

const CROSSFADE_STEPS = 10;
const CROSSFADE_STEP_MS = 200; // 2s total
const POOL_REFILL_AT = 2;
const INITIAL_BPM = 160;
const INTERRUPT_BPM_DELTA = 25; // only cut the current track on a large tempo jump

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

export default function RunScreen() {
  const insets = useSafeAreaInsets();
  const { isRunning, isTestMode, currentBPM, currentTrack, trackTempo, setRunning, setTestMode, setCurrentTrack, setTrackTempo, deviceId, setDeviceId } =
    useRunStore();
  const { getValidToken, logout } = useSpotify();

  useEffect(() => {
    if (!currentTrack) { setTrackTempo(null); return; }
    getValidToken()
      .then((token) => getTrackTempo(token, currentTrack.id))
      .then((tempo) => {
        if (tempo == null) console.warn('[BeatMatch] No tempo returned for track:', currentTrack.name, currentTrack.id);
        setTrackTempo(tempo);
      })
      .catch(() => {
        console.warn('[BeatMatch] Failed to fetch tempo for track:', currentTrack.name, currentTrack.id);
        setTrackTempo(null);
      });
  }, [currentTrack?.id]);

  const [starting, setStarting] = useState(false);
  const [crossfading, setCrossfading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);
  const trackPool = useRef<SpotifyTrack[]>([]);
  const isCrossfading = useRef(false);
  const lastBPM = useRef(INITIAL_BPM);

  const refillPool = async (token: string, bpm: number) => {
    const tracks = await getRecommendations(token, bpm);
    // Avoid repeating the current track
    trackPool.current = tracks.filter((t) => t.id !== currentTrack?.id);
  };

  const crossfadeToNext = useCallback(
    async (bpm: number) => {
      if (isCrossfading.current) return;
      isCrossfading.current = true;
      setCrossfading(true);

      try {
        const token = await getValidToken();
        const state = await getPlaybackState(token);
        if (!state?.device) return;

        const devId = state.device.id || deviceId || undefined;
        if (devId && devId !== deviceId) setDeviceId(devId);

        if (trackPool.current.length <= POOL_REFILL_AT) {
          await refillPool(token, bpm);
        }

        const next = trackPool.current.shift();
        if (!next) return;

        await addToQueue(token, next.uri, devId);

        // Fade out
        const startVol = state.device.volume_percent;
        for (let i = CROSSFADE_STEPS; i >= 0; i--) {
          await setVolume(token, (startVol * i) / CROSSFADE_STEPS, devId);
          await sleep(CROSSFADE_STEP_MS);
        }

        await skipToNext(token);
        setCurrentTrack(next);

        // Fade in
        for (let i = 0; i <= CROSSFADE_STEPS; i++) {
          await setVolume(token, (startVol * i) / CROSSFADE_STEPS, devId);
          await sleep(CROSSFADE_STEP_MS);
        }
      } catch (e) {
        console.error('Crossfade error:', e);
      } finally {
        isCrossfading.current = false;
        setCrossfading(false);
      }
    },
    [deviceId, currentTrack, getValidToken]
  );

  const queueNextTrack = useCallback(async (bpm: number) => {
    try {
      const token = await getValidToken();
      if (trackPool.current.length <= POOL_REFILL_AT) {
        await refillPool(token, bpm);
      }
      const next = trackPool.current.shift();
      if (next) await addToQueue(token, next.uri, deviceId ?? undefined);
    } catch (e) {
      console.error('Queue error:', e);
    }
  }, [deviceId, getValidToken]);

  const crossfadeRef = useRef(crossfadeToNext);
  crossfadeRef.current = crossfadeToNext;
  const queueRef = useRef(queueNextTrack);
  queueRef.current = queueNextTrack;

  const onSignificantChange = useCallback((bpm: number) => {
    const delta = Math.abs(bpm - lastBPM.current);
    lastBPM.current = bpm;
    if (delta >= INTERRUPT_BPM_DELTA) {
      crossfadeRef.current(bpm);
    } else {
      queueRef.current(bpm);
    }
  }, []);

  useCadence(isRunning ? onSignificantChange : undefined);

  const handleStart = async () => {
    setStarting(true);
    try {
      const token = await getValidToken();
      const state = await getPlaybackState(token);

      if (!state) {
        if (!isTestMode) {
          Alert.alert(
            'Open Spotify',
            'Start playing something in the Spotify app first, then tap Start Run.',
            [{ text: 'OK' }]
          );
          return;
        }
      } else {
        if (state.item) setCurrentTrack(state.item as SpotifyTrack);
        if (state.device?.id) setDeviceId(state.device.id);
        setIsPlaying(state.is_playing);
        await refillPool(token, INITIAL_BPM);
      }

      setRunning(true);
    } catch (e) {
      console.error(e);
    } finally {
      setStarting(false);
    }
  };

  const handlePlayPause = async () => {
    try {
      const token = await getValidToken();
      if (isPlaying) {
        await pausePlayback(token);
        setIsPlaying(false);
      } else {
        await resumePlayback(token);
        setIsPlaying(true);
      }
    } catch (e) {
      console.error('Play/pause error:', e);
    }
  };

  const handlePrev = async () => {
    try {
      const token = await getValidToken();
      await previousTrack(token);
      await sleep(500);
      const state = await getPlaybackState(token);
      if (state?.item) { setCurrentTrack(state.item as SpotifyTrack); setIsPlaying(state.is_playing); }
    } catch (e) {
      console.error('Previous track error:', e);
    }
  };

  const handleNext = async () => {
    try {
      const token = await getValidToken();
      await skipToNext(token);
      await sleep(500);
      const state = await getPlaybackState(token);
      if (state?.item) { setCurrentTrack(state.item as SpotifyTrack); setIsPlaying(state.is_playing); }
    } catch (e) {
      console.error('Next track error:', e);
    }
  };

  const handleStop = () => {
    setRunning(false);
    isCrossfading.current = false;
    setCrossfading(false);
    trackPool.current = [];
  };

  const handleLogout = () => {
    handleStop();
    logout().then(() => router.replace('/'));
  };

  const albumArt = currentTrack?.album.images[0]?.url;

  return (
    <View style={[styles.container, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}>
      <StatusBar style="light" />

      <View style={styles.header}>
        <Text style={styles.title}>BeatMatch</Text>
        <View style={styles.headerRight}>
          {!isRunning && (
            <Pressable
              onPress={() => setTestMode(!isTestMode)}
              hitSlop={12}
              style={[styles.testBadge, isTestMode && styles.testBadgeActive]}
            >
              <Text style={[styles.testBadgeText, isTestMode && styles.testBadgeTextActive]}>
                TEST
              </Text>
            </Pressable>
          )}
          {isTestMode && isRunning && (
            <View style={[styles.testBadge, styles.testBadgeActive]}>
              <Text style={styles.testBadgeTextActive}>TEST</Text>
            </View>
          )}
          <Pressable onPress={handleLogout} hitSlop={12}>
            <Text style={styles.logoutText}>Log out</Text>
          </Pressable>
        </View>
      </View>

      {/* BPM display */}
      <View style={styles.bpmBlock}>
        <Text style={styles.bpmNumber}>
          {isRunning && currentBPM > 0 ? currentBPM : '--'}
        </Text>
        <Text style={styles.bpmLabel}>steps / min</Text>
        {crossfading && <Text style={styles.crossfadeHint}>Switching tracks…</Text>}
      </View>

      {/* Track card */}
      <View style={styles.trackCard}>
        {albumArt ? (
          <Image source={{ uri: albumArt }} style={styles.albumArt} />
        ) : (
          <View style={[styles.albumArt, styles.albumPlaceholder]} />
        )}
        <View style={styles.trackInfo}>
          <Text style={styles.trackName} numberOfLines={1}>
            {currentTrack?.name ??
              (isRunning ? 'Detecting cadence…' : 'Start running to sync music')}
          </Text>
          <Text style={styles.artistName} numberOfLines={1}>
            {currentTrack?.artists.map((a) => a.name).join(', ') ?? ''}
          </Text>
          {trackTempo != null && (
            <Text style={styles.trackTempo}>{trackTempo} BPM</Text>
          )}
        </View>
      </View>

      {/* Playback controls */}
      {currentTrack && (
        <View style={styles.controls}>
          <Pressable onPress={handlePrev} hitSlop={12} style={styles.controlBtn}>
            <Ionicons name="play-skip-back" size={28} color="#fff" />
          </Pressable>
          <Pressable onPress={handlePlayPause} hitSlop={12} style={[styles.controlBtn, styles.controlBtnPrimary]}>
            <Ionicons name={isPlaying ? 'pause' : 'play'} size={32} color="#000" />
          </Pressable>
          <Pressable onPress={handleNext} hitSlop={12} style={styles.controlBtn}>
            <Ionicons name="play-skip-forward" size={28} color="#fff" />
          </Pressable>
        </View>
      )}

      {/* Start / Stop */}
      {isRunning ? (
        <Pressable style={[styles.button, styles.stopButton]} onPress={handleStop}>
          <Text style={styles.buttonText}>Stop Run</Text>
        </Pressable>
      ) : (
        <Pressable
          style={[styles.button, starting && styles.buttonDisabled]}
          onPress={handleStart}
          disabled={starting}
        >
          {starting ? (
            <ActivityIndicator color="#000" />
          ) : (
            <Text style={styles.buttonText}>{isTestMode ? 'Start Test Run' : 'Start Run'}</Text>
          )}
        </Pressable>
      )}

      {isRunning && currentBPM === 0 && (
        <Text style={styles.hint}>Keep your phone in your hand or pocket</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f0f',
    paddingHorizontal: 24,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 40,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  testBadge: {
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  testBadgeActive: {
    borderColor: '#f0a500',
    backgroundColor: 'rgba(240,165,0,0.12)',
  },
  testBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#444',
    letterSpacing: 1,
  },
  testBadgeTextActive: {
    fontSize: 11,
    fontWeight: '700',
    color: '#f0a500',
    letterSpacing: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.5,
  },
  logoutText: {
    fontSize: 14,
    color: '#555',
  },
  bpmBlock: {
    alignItems: 'center',
    marginBottom: 40,
  },
  bpmNumber: {
    fontSize: 100,
    fontWeight: '800',
    color: '#1DB954',
    lineHeight: 108,
    letterSpacing: -4,
  },
  bpmLabel: {
    fontSize: 16,
    color: '#555',
    marginTop: 4,
  },
  crossfadeHint: {
    fontSize: 13,
    color: '#1DB954',
    marginTop: 8,
  },
  trackCard: {
    flexDirection: 'row',
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    marginBottom: 24,
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 32,
    marginBottom: 32,
  },
  controlBtn: {
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  controlBtnPrimary: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#1DB954',
  },
  albumArt: {
    width: 72,
    height: 72,
    borderRadius: 8,
  },
  albumPlaceholder: {
    backgroundColor: '#2a2a2a',
  },
  trackInfo: {
    flex: 1,
    marginLeft: 16,
  },
  trackName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
  },
  artistName: {
    fontSize: 14,
    color: '#888',
    marginTop: 4,
  },
  trackTempo: {
    fontSize: 12,
    color: '#1DB954',
    marginTop: 4,
  },
  button: {
    backgroundColor: '#1DB954',
    paddingVertical: 18,
    borderRadius: 36,
    alignItems: 'center',
  },
  stopButton: {
    backgroundColor: '#c0392b',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#000',
    fontWeight: '800',
    fontSize: 18,
  },
  hint: {
    color: '#444',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 24,
  },
});
