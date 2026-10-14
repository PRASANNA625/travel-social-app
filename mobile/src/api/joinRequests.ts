import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "./client";
import type { JoinRequest, Trip } from "../types";

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

// --- Invitations ----------------------------------------------------------------

export interface InvitableBuddy {
  id: string;
  name: string;
  photoUrl: string | null;
  location: string | null;
  // Their request on this trip: INVITED, APPROVED (taking part), PENDING (asked to join)...
  status: JoinRequest["status"] | null;
}

export type Invitation = JoinRequest & { trip: Trip & { owner: { id: string; name: string; photoUrl: string | null } } };

function invalidateJoinState(queryClient: ReturnType<typeof useQueryClient>, tripId?: string) {
  queryClient.invalidateQueries({ queryKey: ["join-requests"] });
  queryClient.invalidateQueries({ queryKey: ["trips"] });
  queryClient.invalidateQueries({ queryKey: ["groups"] });
  if (tripId) queryClient.invalidateQueries({ queryKey: ["trips", tripId] });
}

export function useInvitableBuddies(tripId?: string, enabled = true) {
  return useQuery({
    queryKey: ["join-requests", "trip", tripId, "invitable"],
    queryFn: async () => (await apiClient.get<InvitableBuddy[]>(`/join-requests/trips/${tripId}/invitable`)).data,
    enabled: !!tripId && enabled,
  });
}

export function useSendInvitation(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) =>
      (await apiClient.post<JoinRequest>(`/join-requests/trips/${tripId}/invite`, { userId })).data,
    onSuccess: () => invalidateJoinState(queryClient, tripId),
  });
}

export function useMyInvitations() {
  return useQuery({
    queryKey: ["join-requests", "invitations"],
    queryFn: async () => (await apiClient.get<Invitation[]>("/join-requests/invitations")).data,
  });
}

export function useRespondToInvitation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ requestId, accept }: { requestId: string; accept: boolean; tripId?: string }) =>
      (await apiClient.post<JoinRequest>(`/join-requests/${requestId}/${accept ? "accept" : "decline"}`)).data,
    onSuccess: (_data, vars) => invalidateJoinState(queryClient, vars.tripId),
  });
}

// Join from a card: the trip comes with each call.
export function useJoinTrip() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (tripId: string) => (await apiClient.post<JoinRequest>(`/join-requests/trips/${tripId}`, {})).data,
    onSuccess: (_data, tripId) => invalidateJoinState(queryClient, tripId),
  });
}
