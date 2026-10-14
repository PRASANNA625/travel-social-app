import * as Location from "expo-location";

const TIMEOUT_MS = 15000;

export async function getCurrentLocationOrThrow(): Promise<{ lat: number; lng: number }> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== "granted") {
    throw new Error("Location access is off. Allow location for Triply in your browser or device settings, then try again.");
  }
  // Browsers can sit on a position request indefinitely; give up after a while.
  const position = await Promise.race([
    Location.getCurrentPositionAsync({}),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Couldn't find your location. Check that location services are on and try again.")), TIMEOUT_MS)
    ),
  ]);
  return { lat: position.coords.latitude, lng: position.coords.longitude };
}
