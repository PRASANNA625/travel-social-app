import * as Location from "expo-location";
import { LocationError } from "./currentLocation.shared";

export { LocationError, locationProblemOf, type LocationProblem } from "./currentLocation.shared";

const TIMEOUT_MS = 15000;

export async function getCurrentLocationOrThrow(): Promise<{ lat: number; lng: number }> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== "granted") {
    throw new LocationError("denied", "Location access is off. Allow location for Triply in your device settings, then try again.");
  }
  try {
    const position = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new LocationError("timeout", "Finding your location took too long.")), TIMEOUT_MS)),
    ]);
    return { lat: position.coords.latitude, lng: position.coords.longitude };
  } catch (err) {
    if (err instanceof LocationError) throw err;
    throw new LocationError("unavailable", "Couldn't find your location. Check that location services are on.");
  }
}
