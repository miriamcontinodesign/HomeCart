// Where the map searches from. Three sources, in the order MapScreen tries them:
//   1. a temporary area picked on the map (holidays) — this browser only, until cleared
//   2. the device's current location (GPS), if the browser allows it
//   3. the user's saved "Your area" (profiles.home_city / home_lat / home_lng)
// …and New York as a last resort.
import * as Location from 'expo-location';
import { apiFetchJson } from './api';

export type Area = { label: string; lat: number; lon: number; current?: boolean };  // current = from GPS
export type AreaSuggestion = { place_id: string; label: string; address: string };

export const FALLBACK_AREA: Area = { label: 'New York, NY', lat: 40.7128, lon: -74.006 };

export async function searchAreas(q: string): Promise<AreaSuggestion[]> {
  const data = await apiFetchJson(`/geocode?q=${encodeURIComponent(q)}`);
  return data.results || [];
}

export async function resolveArea(s: AreaSuggestion): Promise<Area> {
  const d = await apiFetchJson(`/geocode/place?id=${encodeURIComponent(s.place_id)}`);
  // Prefer the suggestion's full text ("Jersey City, NJ, USA") over the bare place name.
  return { label: s.address || d.address || d.label, lat: d.lat, lon: d.lon };
}

// GPS with a timeout: browsers can sit on a pending permission prompt indefinitely.
export async function getDeviceLocation(timeoutMs = 10000): Promise<Area | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    const loc = await Promise.race([
      Location.getCurrentPositionAsync({}),
      new Promise<null>(r => setTimeout(() => r(null), timeoutMs)),
    ]);
    if (!loc) return null;
    return { label: 'Your current location', lat: loc.coords.latitude, lon: loc.coords.longitude, current: true };
  } catch {
    return null;  // blocked, unsupported, or insecure origin
  }
}

const TEMP_KEY = 'homecart_map_temp_area';

export function loadTempArea(): Area | null {
  try {
    const raw = window.localStorage.getItem(TEMP_KEY);
    const a = raw ? JSON.parse(raw) : null;
    return a && typeof a.lat === 'number' && typeof a.lon === 'number' ? a : null;
  } catch {
    return null;
  }
}

export function saveTempArea(a: Area | null): void {
  try {
    if (a) window.localStorage.setItem(TEMP_KEY, JSON.stringify(a));
    else window.localStorage.removeItem(TEMP_KEY);
  } catch { /* storage blocked — the temporary area just won't persist */ }
}

export function profileArea(p?: { home_city?: string | null; home_lat?: number | null; home_lng?: number | null } | null): Area | null {
  if (!p || p.home_lat == null || p.home_lng == null) return null;
  return { label: p.home_city || 'Your area', lat: Number(p.home_lat), lon: Number(p.home_lng) };
}
