import type { ConfigContext, ExpoConfig } from "expo/config";

// EXPO_PUBLIC_API_URL (e.g. from a gitignored .env.local) overrides the
// production API URL in app.json; unset, builds use app.json unchanged.
export default ({ config }: ConfigContext): ExpoConfig => {
  const apiUrl = process.env.EXPO_PUBLIC_API_URL?.trim();
  return {
    ...(config as ExpoConfig),
    extra: {
      ...config.extra,
      ...(apiUrl ? { apiUrl } : {}),
    },
  };
};
