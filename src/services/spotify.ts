const BASE = 'https://api.spotify.com/v1';

export type SpotifyTrack = {
  id: string;
  uri: string;
  name: string;
  artists: { name: string }[];
  album: { name: string; images: { url: string; width: number; height: number }[] };
  duration_ms: number;
};

export type PlaybackState = {
  is_playing: boolean;
  item: SpotifyTrack | null;
  device: { id: string; volume_percent: number } | null;
  progress_ms: number;
};

export type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
};

const h = (token: string) => ({ Authorization: `Bearer ${token}` });

async function logResponse(label: string, res: Response): Promise<unknown> {
  const text = await res.text();
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  console.log(`[spotify] ${label} status=${res.status}`, JSON.stringify(parsed));
  return parsed;
}

type TopArtistData = { ids: string[]; genres: string[] };

async function getTopArtistData(token: string): Promise<TopArtistData> {
  const url = `${BASE}/me/top/artists?limit=10&time_range=medium_term`;
  console.log('[spotify] top artists:', url);
  const res = await fetch(url, { headers: h(token) });
  const data = await logResponse('top artists', res) as { items?: { id: string; genres: string[] }[] };
  if (!res.ok) return { ids: [], genres: [] };
  const items = data.items ?? [];
  const ids = items.map((a) => a.id);
  const genreCount: Record<string, number> = {};
  for (const artist of items) {
    for (const genre of (artist.genres ?? [])) {
      genreCount[genre] = (genreCount[genre] ?? 0) + 1;
    }
  }
  const genres = Object.entries(genreCount)
    .sort((a, b) => b[1] - a[1])
    .map(([g]) => g);
  return { ids, genres };
}

export async function getRecommendations(
  token: string,
  bpm: number
): Promise<SpotifyTrack[]> {
  const { ids, genres } = await getTopArtistData(token);

  // Preferred path: /recommendations supports target_tempo + personal seeds
  if (ids.length > 0) {
    const params = new URLSearchParams({
      seed_artists: ids.slice(0, 3).join(','),
      target_tempo: String(bpm),
      min_tempo: String(bpm - 15),
      max_tempo: String(bpm + 15),
      limit: '10',
    });
    const recUrl = `${BASE}/recommendations?${params}`;
    console.log('[spotify] recommendations:', recUrl);
    const recRes = await fetch(recUrl, { headers: h(token) });
    const recData = await logResponse('recommendations', recRes) as { tracks?: SpotifyTrack[] };
    if (recRes.ok) {
      const tracks: SpotifyTrack[] = recData.tracks ?? [];
      if (tracks.length > 0) return tracks.sort(() => Math.random() - 0.5);
    } else if (recRes.status !== 404) {
      console.warn('[spotify] recommendations failed:', recRes.status);
    } else {
      console.warn('[spotify] recommendations 404 — falling back to genre search');
    }
  }

  // Fallback: search by genre derived from user's top artists
  const genre = genres[Math.floor(Math.random() * Math.min(genres.length, 5))];
  const q = genre ? `genre:${genre}` : 'year:2020-2025';
  const params = new URLSearchParams({ q, type: 'track', limit: '10', market: 'from_token' });
  const url = `${BASE}/search?${params}`;
  console.log('[spotify] genre search:', url);
  const res = await fetch(url, { headers: h(token) });
  const data = await logResponse('search', res) as { tracks?: { items: SpotifyTrack[] } };
  if (!res.ok) throw new Error(`Search failed: ${res.status}`);
  const tracks: SpotifyTrack[] = data.tracks?.items ?? [];
  return tracks.sort(() => Math.random() - 0.5);
}

export async function getTrackTempo(token: string, trackId: string): Promise<number | null> {
  // Try audio-features first (lighter payload, same deprecation tier)
  const featUrl = `${BASE}/audio-features/${trackId}`;
  console.log('[spotify] audio-features:', featUrl);
  const featRes = await fetch(featUrl, { headers: h(token) });
  const feat = await logResponse('audio-features', featRes);
  if (featRes.ok && typeof (feat as { tempo?: number }).tempo === 'number') {
    return Math.round((feat as { tempo: number }).tempo);
  }
  // Fall back to audio-analysis
  const analysisUrl = `${BASE}/audio-analysis/${trackId}`;
  console.log('[spotify] audio-analysis:', analysisUrl);
  const analysisRes = await fetch(analysisUrl, { headers: h(token) });
  const analysis = await logResponse('audio-analysis', analysisRes) as { track?: { tempo?: number } };
  if (!analysisRes.ok) return null;
  return typeof analysis.track?.tempo === 'number' ? Math.round(analysis.track.tempo) : null;
}

export async function getPlaybackState(token: string): Promise<PlaybackState | null> {
  const url = `${BASE}/me/player`;
  console.log('[spotify] playback state:', url);
  const res = await fetch(url, { headers: h(token) });
  if (res.status === 204) {
    console.log('[spotify] playback state status=204 (no active player)');
    return null;
  }
  const data = await logResponse('playback state', res);
  if (!res.ok) throw new Error(`Playback state failed: ${res.status}`);
  return data as PlaybackState;
}

export async function setVolume(token: string, volumePercent: number, deviceId?: string): Promise<void> {
  const params = new URLSearchParams({ volume_percent: String(Math.round(volumePercent)) });
  if (deviceId) params.append('device_id', deviceId);
  const url = `${BASE}/me/player/volume?${params}`;
  console.log('[spotify] set volume:', url);
  const res = await fetch(url, { method: 'PUT', headers: h(token) });
  if (!res.ok) await logResponse('set volume', res);
}

export async function skipToNext(token: string): Promise<void> {
  const url = `${BASE}/me/player/next`;
  console.log('[spotify] skip to next:', url);
  const res = await fetch(url, { method: 'POST', headers: h(token) });
  if (!res.ok) await logResponse('skip to next', res);
}

export async function previousTrack(token: string): Promise<void> {
  const url = `${BASE}/me/player/previous`;
  console.log('[spotify] previous track:', url);
  const res = await fetch(url, { method: 'POST', headers: h(token) });
  if (!res.ok) await logResponse('previous track', res);
}

export async function pausePlayback(token: string): Promise<void> {
  const url = `${BASE}/me/player/pause`;
  console.log('[spotify] pause:', url);
  const res = await fetch(url, { method: 'PUT', headers: h(token) });
  if (!res.ok) await logResponse('pause', res);
}

export async function resumePlayback(token: string): Promise<void> {
  const url = `${BASE}/me/player/play`;
  console.log('[spotify] resume:', url);
  const res = await fetch(url, { method: 'PUT', headers: h(token) });
  if (!res.ok) await logResponse('resume', res);
}

export async function addToQueue(token: string, trackUri: string, deviceId?: string): Promise<void> {
  const params = new URLSearchParams({ uri: trackUri });
  if (deviceId) params.append('device_id', deviceId);
  const url = `${BASE}/me/player/queue?${params}`;
  console.log('[spotify] add to queue:', url);
  const res = await fetch(url, { method: 'POST', headers: h(token) });
  if (!res.ok) await logResponse('add to queue', res);
}

export async function refreshAccessToken(
  refreshToken: string,
  clientId: string
): Promise<TokenResponse> {
  const url = 'https://accounts.spotify.com/api/token';
  console.log('[spotify] refresh token:', url);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
    }).toString(),
  });
  const data = await logResponse('refresh token', res);
  if (!res.ok) throw new Error('Token refresh failed');
  return data as TokenResponse;
}
