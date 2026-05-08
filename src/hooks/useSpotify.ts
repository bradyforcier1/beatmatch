import * as AuthSession from 'expo-auth-session';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useRef, useCallback } from 'react';
import { refreshAccessToken } from '../services/spotify';
import { useRunStore } from '../store/runStore';

WebBrowser.maybeCompleteAuthSession();

const CLIENT_ID = process.env.EXPO_PUBLIC_SPOTIFY_CLIENT_ID!;
const REDIRECT_URI = AuthSession.makeRedirectUri({ scheme: 'beatmatch' });
console.log('[useSpotify] REDIRECT_URI:', REDIRECT_URI);
const SCOPES = [
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'user-read-private',
  'user-top-read',
];
const DISCOVERY = {
  authorizationEndpoint: 'https://accounts.spotify.com/authorize',
  tokenEndpoint: 'https://accounts.spotify.com/api/token',
};
const STORE = { ACCESS: 'bm_access', REFRESH: 'bm_refresh', EXPIRY: 'bm_expiry' };

export function useSpotify() {
  const { setTokens, accessToken, refreshToken, tokenExpiry, clearAuth } = useRunStore();
  const loginResolve = useRef<((token: string) => void) | null>(null);
  const loginReject = useRef<((e: Error) => void) | null>(null);

  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: CLIENT_ID,
      scopes: SCOPES,
      redirectUri: REDIRECT_URI,
      usePKCE: true,
    },
    DISCOVERY
  );

  // Handle the auth response when the browser redirects back
  useEffect(() => {
    if (!response) return;

    if (response.type === 'success') {
      const { code } = response.params;
      exchangeCode(code, request?.codeVerifier);
    } else if (response.type === 'error' || response.type === 'dismiss') {
      loginReject.current?.(new Error(response.type === 'dismiss' ? 'Cancelled' : 'Auth failed'));
      loginReject.current = null;
      loginResolve.current = null;
    }
  }, [response]);

  const exchangeCode = async (code: string, verifier?: string) => {
    try {
      const res = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: REDIRECT_URI,
          client_id: CLIENT_ID,
          ...(verifier ? { code_verifier: verifier } : {}),
        }).toString(),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => res.text());
        console.error('[useSpotify] Token exchange failed:', JSON.stringify(err));
        throw new Error('Token exchange failed');
      }
      const data = await res.json();

      await SecureStore.setItemAsync(STORE.ACCESS, data.access_token);
      await SecureStore.setItemAsync(STORE.REFRESH, data.refresh_token);
      await SecureStore.setItemAsync(STORE.EXPIRY, String(Date.now() + data.expires_in * 1000));

      setTokens(data.access_token, data.refresh_token, data.expires_in);
      loginResolve.current?.(data.access_token);
    } catch (e) {
      loginReject.current?.(e as Error);
    } finally {
      loginResolve.current = null;
      loginReject.current = null;
    }
  };

  const login = useCallback((): Promise<string> => {
    return new Promise((resolve, reject) => {
      loginResolve.current = resolve;
      loginReject.current = reject;
      promptAsync();
    });
  }, [promptAsync]);

  const getValidToken = useCallback(async (): Promise<string> => {
    if (accessToken && Date.now() < tokenExpiry - 60_000) return accessToken;

    const storedRefresh = refreshToken ?? (await SecureStore.getItemAsync(STORE.REFRESH));
    if (!storedRefresh) throw new Error('Not authenticated');

    const data = await refreshAccessToken(storedRefresh, CLIENT_ID);
    await SecureStore.setItemAsync(STORE.ACCESS, data.access_token);
    if (data.refresh_token) await SecureStore.setItemAsync(STORE.REFRESH, data.refresh_token);
    await SecureStore.setItemAsync(STORE.EXPIRY, String(Date.now() + data.expires_in * 1000));

    setTokens(data.access_token, data.refresh_token ?? storedRefresh, data.expires_in);
    return data.access_token;
  }, [accessToken, refreshToken, tokenExpiry]);

  const restoreSession = useCallback(async (): Promise<boolean> => {
    const access = await SecureStore.getItemAsync(STORE.ACCESS);
    const refresh = await SecureStore.getItemAsync(STORE.REFRESH);
    const expiry = await SecureStore.getItemAsync(STORE.EXPIRY);
    if (!access || !refresh || !expiry) return false;
    setTokens(access, refresh, (Number(expiry) - Date.now()) / 1000);
    return true;
  }, []);

  const logout = useCallback(async () => {
    await SecureStore.deleteItemAsync(STORE.ACCESS);
    await SecureStore.deleteItemAsync(STORE.REFRESH);
    await SecureStore.deleteItemAsync(STORE.EXPIRY);
    clearAuth();
  }, []);

  return { login, getValidToken, restoreSession, logout, ready: !!request };
}
