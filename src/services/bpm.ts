const BASE = 'https://api.getsongbpm.com';
const API_KEY = process.env.EXPO_PUBLIC_GETSONGBPM_API_KEY;

type SongResult = {
  id: string;
  title: string;
  tempo: string | number;
  artist?: { name: string };
};

export async function getSongTempo(
  trackName: string,
  artistName: string
): Promise<number | null> {
  if (!API_KEY) {
    console.warn('[bpm] EXPO_PUBLIC_GETSONGBPM_API_KEY is not set');
    return null;
  }

  const lookup = encodeURIComponent(`${artistName} ${trackName}`);
  const url = `${BASE}/search/?api_key=${API_KEY}&type=song&lookup=${lookup}`;
  console.log('[bpm] search:', url);

  try {
    const res = await fetch(url);
    const text = await res.text();
    let data: unknown;
    try { data = JSON.parse(text); } catch { data = text; }
    console.log(`[bpm] search status=${res.status}`, JSON.stringify(data));

    if (!res.ok) return null;

    const results: SongResult[] = (data as { search?: SongResult[] }).search ?? [];
    if (results.length === 0) return null;

    const tempo = Number(results[0].tempo);
    return Number.isFinite(tempo) && tempo > 0 ? Math.round(tempo) : null;
  } catch (e) {
    console.warn('[bpm] search failed:', e);
    return null;
  }
}
