# BeatMatch

React Native / Expo app that detects running cadence via accelerometer and queues Spotify tracks to match the runner's BPM.

## Stack

- **Expo** ~54 with expo-router (file-based routing under `app/`)
- **React Native** 0.81 / React 19
- **Zustand** for global state (`src/store/runStore.ts`)
- **expo-auth-session** for Spotify OAuth PKCE flow
- **expo-sensors** for accelerometer cadence detection
- TypeScript throughout, no test suite

## Running the app

```
npm start          # Expo dev server
npm run ios        # iOS simulator
npm run android    # Android emulator
```

Requires `.env.local` with `EXPO_PUBLIC_SPOTIFY_CLIENT_ID`.

## Project layout

```
app/              # Expo Router screens
src/
  services/
    spotify.ts    # All Spotify API calls
    cadence.ts    # Accelerometer → BPM detection
  hooks/
    useSpotify.ts # OAuth + token management
    useCadence.ts # Cadence hook with smoothing + simulation
  store/
    runStore.ts   # Zustand store (tokens, currentBPM, run state)
```

## Spotify integration

### OAuth scopes

Scopes are declared in `src/hooks/useSpotify.ts`. Adding a new scope requires the user to re-authorize — the stored token won't include it. Current scopes:

- `user-read-playback-state`
- `user-modify-playback-state`
- `user-read-currently-playing`
- `user-read-private`
- `user-top-read`

### Deprecated endpoints (unavailable for new apps after Nov 2024)

- `/recommendations` — returns 404
- `/audio-features` — no longer accessible

Do not attempt to use these. Any feature requiring BPM-matched recommendations or audio analysis must work around this.

### Track discovery approach

`getRecommendations` in `spotify.ts`:
1. Fetches `/me/top/artists` (requires `user-top-read`) and extracts genres ranked by frequency
2. Picks randomly from the top 5 genres
3. Searches with `genre:<genre>` via `/search`

This keeps results personal to the user's taste without any activity-specific keywords.

### Search API notes

- Endpoint: `GET /v1/search`
- `limit` max is **10**
- Supported field filters: `genre:`, `artist:`, `album:`, `track:`, `year:`, `isrc:`
- No tempo/BPM filtering available via search
- Docs: https://developer.spotify.com/documentation/web-api/reference/search

### Checking API docs

When hitting a Spotify API issue, fetch the reference page directly:

```
WebFetch https://developer.spotify.com/documentation/web-api/reference/<endpoint-name>
```

The reference pages list all query parameters, valid value ranges, required scopes, and deprecation notices. Check these before assuming an endpoint works a certain way — the Spotify API has changed significantly and several commonly-referenced endpoints are deprecated for newer apps.
