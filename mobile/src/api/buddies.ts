import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "./client";
import type { BuddyConnection, BuddyMatch, Paginated, TravelMode } from "../types";

export interface BuddyFilters {
  search?: string;
  interest?: string;
  travelMode?: TravelMode;
  location?: string;
  page?: number;
  pageSize?: number;
}

export function useBuddyMatches(filters: BuddyFilters = {}) {
  return useQuery({
    queryKey: ["buddies", "matches", filters],
    queryFn: async () => (await apiClient.get<Paginated<BuddyMatch>>("/buddies/matches", { params: filters })).data,
  });
}

export function usePendingBuddyRequests() {
  return useQuery({
    queryKey: ["buddies", "requests", "pending"],
    queryFn: async () => (await apiClient.get<BuddyConnection[]>("/buddies/requests/pending")).data,
  });
}

export function useSendBuddyRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => (await apiClient.post<BuddyConnection>(`/buddies/${userId}/connect`)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["buddies"] }),
  });
}

export function useRespondToBuddyRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ requestId, accept }: { requestId: string; accept: boolean }) =>
      (await apiClient.post<BuddyConnection>(`/buddies/requests/${requestId}/${accept ? "accept" : "reject"}`)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["buddies"] }),
  });
}
