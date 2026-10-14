// Web sibling of currentLocation.ts. expo-location's web build reports
// "granted" when the browser simply can't get a fix (and never times out),
// so ask the browser directly and keep the reasons apart.
import { LocationError } from "./currentLocation.shared";

export { LocationError, locationProblemOf, type LocationProblem } from "./currentLocation.shared";

const TIMEOUT_MS = 15000;

export async function getCurrentLocationOrThrow(): Promise<{ lat: number; lng: number }> {
  if (typeof window !== "undefined" && window.isSecureContext === false) {
    throw new LocationError("insecure", "Browsers only share location on secure (https) pages or localhost.");
  }
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    throw new LocationError("unsupported", "This browser can't share its location.");
  }
  try {
    const state = await navigator.permissions?.query({ name: "geolocation" as PermissionName });
    if (state?.state === "denied") {
      throw new LocationError("denied", "Location is blocked for this site in your browser.");
    }
  } catch (err) {
    if (err instanceof LocationError) throw err;
    // Permissions API missing or unhappy: let getCurrentPosition decide.
  }
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => {
        if (err.code === err.PERMISSION_DENIED) reject(new LocationError("denied", "Location is blocked for this site in your browser."));
        else if (err.code === err.TIMEOUT) reject(new LocationError("timeout", "Finding your location took too long."));
        else reject(new LocationError("unavailable", "Your device didn't report a position."));
      },
      // A position from the last few minutes is plenty for "near me".
      { enableHighAccuracy: false, timeout: TIMEOUT_MS, maximumAge: 5 * 60 * 1000 }
    );
  });
}
