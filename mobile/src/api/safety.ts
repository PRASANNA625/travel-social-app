import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "./client";
import type { ReportReason, User } from "../types";

export function useReportUser(userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { reason: ReportReason; details?: string }) =>
      (await apiClient.post(`/safety/users/${userId}/report`, input)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

export function useBlockUser(userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => apiClient.post(`/safety/users/${userId}/block`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users", userId] });
      queryClient.invalidateQueries({ queryKey: ["safety", "blocked"] });
      queryClient.invalidateQueries({ queryKey: ["buddies"] });
    },
  });
}

export function useUnblockUser(userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => apiClient.delete(`/safety/users/${userId}/block`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users", userId] });
      queryClient.invalidateQueries({ queryKey: ["safety", "blocked"] });
      queryClient.invalidateQueries({ queryKey: ["buddies"] });
    },
  });
}

export function useBlockedUsers() {
  return useQuery({
    queryKey: ["safety", "blocked"],
    queryFn: async () => (await apiClient.get<User[]>("/safety/blocked")).data,
  });
}
