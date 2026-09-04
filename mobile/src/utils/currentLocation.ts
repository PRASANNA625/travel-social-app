import * as Location from "expo-location";

export async function getCurrentLocationOrThrow(): Promise<{ lat: number; lng: number }> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== "granted") {
    throw new Error("Location permission not granted");
  }
  const position = await Location.getCurrentPositionAsync({});
  return { lat: position.coords.latitude, lng: position.coords.longitude };
}
