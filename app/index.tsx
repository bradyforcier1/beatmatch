import { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSpotify } from '../src/hooks/useSpotify';

export default function LoginScreen() {
  const [restoring, setRestoring] = useState(true);
  const [logging, setLogging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { login, restoreSession, ready } = useSpotify();

  useEffect(() => {
    restoreSession().then((restored) => {
      if (restored) router.replace('/run');
      else setRestoring(false);
    });
  }, []);

  const handleLogin = async () => {
    setError(null);
    setLogging(true);
    try {
      await login();
      router.replace('/run');
    } catch (e: any) {
      setError(e?.message ?? 'Login failed');
      setLogging(false);
    }
  };

  if (restoring) {
    return (
      <View style={styles.container}>
        <ActivityIndicator color="#1DB954" size="large" />
        <StatusBar style="light" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <Text style={styles.logo}>BeatMatch</Text>
      <Text style={styles.tagline}>Run to the beat</Text>

      <View style={styles.featureList}>
        <Text style={styles.feature}>🏃 Detects your running cadence</Text>
        <Text style={styles.feature}>🎵 Matches music to your pace</Text>
        <Text style={styles.feature}>🔄 Auto-switches tracks when tempo changes</Text>
      </View>

      <Pressable
        style={[styles.button, (!ready || logging) && styles.buttonDisabled]}
        onPress={handleLogin}
        disabled={!ready || logging}
      >
        {logging ? (
          <ActivityIndicator color="#000" />
        ) : (
          <Text style={styles.buttonText}>Connect with Spotify</Text>
        )}
      </Pressable>

      {error && <Text style={styles.error}>{error}</Text>}

      <Text style={styles.disclaimer}>Requires Spotify Premium for playback control</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f0f',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  logo: {
    fontSize: 52,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -2,
  },
  tagline: {
    fontSize: 18,
    color: '#888',
    marginTop: 8,
    marginBottom: 48,
  },
  featureList: {
    width: '100%',
    marginBottom: 48,
    gap: 12,
  },
  feature: {
    fontSize: 15,
    color: '#ccc',
  },
  button: {
    backgroundColor: '#1DB954',
    paddingVertical: 16,
    paddingHorizontal: 40,
    borderRadius: 32,
    minWidth: 240,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#000',
    fontWeight: '700',
    fontSize: 16,
  },
  error: {
    color: '#e74c3c',
    marginTop: 16,
    fontSize: 14,
  },
  disclaimer: {
    color: '#444',
    fontSize: 12,
    marginTop: 32,
    textAlign: 'center',
  },
});
