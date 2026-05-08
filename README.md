# BeatMatch

A React Native app that matches your Spotify music to your running cadence in real time. BeatMatch uses your phone's motion sensors to detect your steps per minute and automatically adjusts which songs are playing to keep the tempo in sync with your pace.

## Features

- Detects running cadence (steps per minute) via device accelerometer
- Authenticates with Spotify via OAuth
- Filters and plays tracks that match your current cadence
- Persistent run session state via Zustand

## Prerequisites

- [Node.js](https://nodejs.org/) (LTS)
- [Expo CLI](https://docs.expo.dev/get-started/installation/)
- A [Spotify Developer](https://developer.spotify.com/dashboard) account with an app registered

## Setup

1. Clone the repo and install dependencies:

   ```bash
   git clone https://github.com/bradyforcier1/beatmatch.git
   cd beatmatch
   npm install
   ```

2. Copy `.env.example` to `.env.local` and fill in your Spotify client ID:

   ```bash
   cp .env.example .env.local
   ```

   ```
   EXPO_PUBLIC_SPOTIFY_CLIENT_ID=your_spotify_client_id_here
   EXPO_PUBLIC_GETSONGBPM_API_KEY=your_getsongbpm_api_key_here
   ```

   Register for a free GetSongBPM API key at [getsongbpm.com/api](https://getsongbpm.com/api).

3. In your Spotify Developer Dashboard, add `beatmatch://` as a Redirect URI.

4. Start the app:

   ```bash
   npx expo start
   ```

## Project Structure

```
app/          # Expo Router screens
src/
  hooks/      # useCadence, useSpotify
  services/   # Spotify API client, cadence detection logic
  store/      # Zustand run state
```

## Tech Stack

- [Expo](https://expo.dev/) / React Native
- [Expo Router](https://expo.github.io/router/)
- [Expo Sensors](https://docs.expo.dev/versions/latest/sdk/sensors/) — accelerometer for cadence
- [Expo Auth Session](https://docs.expo.dev/versions/latest/sdk/auth-session/) — Spotify OAuth
- [Zustand](https://zustand-demo.pmnd.rs/) — state management
- [GetSongBPM](https://getsongbpm.com) — track tempo lookup
- TypeScript
