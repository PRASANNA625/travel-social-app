import { Platform } from "react-native";

// expo-audio's recorder only ever exposes a file uri (unlike ImagePicker's
// web build, which hands back a real File object directly) - on web that uri
// is a blob: URL that must be re-fetched into a real Blob (which carries its
// own correct mimetype, e.g. audio/webm) before FormData can send it; on
// native it's a file:// uri that React Native's networking layer streams
// directly from a { uri, name, type } descriptor, mirroring
// appendImageAsset's native branch and hardcoding the type the
// RecordingPresets.HIGH_QUALITY preset actually produces on native.
export async function appendAudioAsset(form: FormData, field: string, uri: string, fallbackName: string) {
  if (Platform.OS === "web") {
    const blob = await (await fetch(uri)).blob();
    form.append(field, blob, fallbackName);
  } else {
    form.append(field, { uri, name: fallbackName, type: "audio/m4a" } as unknown as Blob);
  }
}
