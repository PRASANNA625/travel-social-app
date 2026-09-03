import { useQuery } from "@tanstack/react-query";
import { apiClient } from "./client";
import type { Group } from "../types";

export function useGroupByTrip(tripId?: string) {
  return useQuery({
    queryKey: ["groups", "by-trip", tripId],
    queryFn: async () => (await apiClient.get<Group>(`/groups/by-trip/${tripId}`)).data,
    enabled: !!tripId,
  });
}

export function useGroup(groupId?: string) {
  return useQuery({
    queryKey: ["groups", groupId],
    queryFn: async () => (await apiClient.get<Group>(`/groups/${groupId}`)).data,
    enabled: !!groupId,
  });
}
