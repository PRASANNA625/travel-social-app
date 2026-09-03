import type { ImagePickerAsset } from "expo-image-picker";

// On web, ImagePickerAsset carries a real File (blob: URIs aren't readable by
// the browser's FormData/fetch layer); on native it only has a file:// uri,
// which React Native's networking layer knows how to stream from a
// { uri, name, type } descriptor.
export function appendImageAsset(
  form: FormData,
  field: string,
  asset: ImagePickerAsset,
  fallbackName: string
) {
  if (asset.file) {
    form.append(field, asset.file, asset.fileName ?? fallbackName);
  } else {
    form.append(field, { uri: asset.uri, name: fallbackName, type: "image/jpeg" } as unknown as Blob);
  }
}
