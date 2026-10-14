import { Platform } from "react-native";

export type Coords = { lat: number; lng: number };

const TIMEOUT_MS = 5000;

// Best-effort lookup of a typed place name (same OpenStreetMap service as the
// map picker), so trips without a map pin still show up in "Near me".
// Returns null when the place isn't found or the lookup fails or is slow.
export async function geocodePlace(query: string): Promise<Coords | null> {
  const q = query.trim();
  if (q.length < 2) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1`,
      {
        signal: controller.signal,
        ...(Platform.OS === "web" ? {} : { headers: { "User-Agent": "TriplyApp/1.0 (Expo app)" } }),
      }
    );
    if (!response.ok) return null;
    const [hit] = (await response.json()) as { lat: string; lon: string }[];
    const lat = Number(hit?.lat);
    const lng = Number(hit?.lon);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Keeps a pinned point; otherwise looks the name up.
export async function resolveCoords(name: string, pinned: Coords | null): Promise<Coords | null> {
  return pinned ?? geocodePlace(name);
}
