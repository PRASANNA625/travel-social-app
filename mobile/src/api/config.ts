import { useQuery } from "@tanstack/react-query";
import { apiClient } from "./client";
import type { TravelMode } from "../types";

// App-wide settings managed from the admin dashboard. The server enforces the
// feature switches too; the app uses them to hide what wouldn't work.
export interface AppConfig {
  features: { aiAssistant: boolean; travelBuddies: boolean; tripCreation: boolean };
  disabledTravelModes: TravelMode[];
  suggestedInterests: string[];
  announcementBanner: string;
}

export function useAppConfig() {
  return useQuery({
    queryKey: ["config"],
    queryFn: async () => (await apiClient.get<AppConfig>("/config")).data,
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
}

// Features stay on until the config says otherwise, so a slow or failed fetch
// never hides anything.
export function useFeature(name: keyof AppConfig["features"]) {
  const { data } = useAppConfig();
  return data?.features[name] ?? true;
}
