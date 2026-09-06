import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "./client";
import type { JoinRequest } from "../types";

export function useJoinRequestsForTrip(tripId?: string) {
  return useQuery({
    queryKey: ["join-requests", "trip", tripId],
    queryFn: async () => (await apiClient.get<JoinRequest[]>(`/join-requests/trips/${tripId}`)).data,
    enabled: !!tripId,
  });
}

export function useMyJoinRequests() {
  return useQuery({
    queryKey: ["join-requests", "mine"],
    queryFn: async () => (await apiClient.get<JoinRequest[]>("/join-requests/mine")).data,
  });
}

export function useMyJoinRequestForTrip(tripId?: string) {
  return useQuery({
    queryKey: ["join-requests", "trip", tripId, "mine"],
    queryFn: async () => (await apiClient.get<JoinRequest | null>(`/join-requests/trips/${tripId}/mine`)).data,
    enabled: !!tripId,
  });
}

export function useExpressInterest(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (message?: string) =>
      (await apiClient.post<JoinRequest>(`/join-requests/trips/${tripId}`, { message })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trips", tripId] });
      queryClient.invalidateQueries({ queryKey: ["join-requests", "mine"] });
      queryClient.invalidateQueries({ queryKey: ["join-requests", "trip", tripId, "mine"] });
    },
  });
}

export function useInviteToTrip(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) =>
      (await apiClient.post<JoinRequest>(`/join-requests/trips/${tripId}/invite`, { userId })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["join-requests", "trip", tripId] });
      queryClient.invalidateQueries({ queryKey: ["trips", tripId] });
    },
  });
}

export function useRespondToJoinRequest(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ requestId, approve }: { requestId: string; approve: boolean }) =>
      (await apiClient.post<JoinRequest>(`/join-requests/${requestId}/${approve ? "approve" : "reject"}`)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["join-requests", "trip", tripId] });
      queryClient.invalidateQueries({ queryKey: ["trips", tripId] });
      queryClient.invalidateQueries({ queryKey: ["groups"] });
    },
  });
}
