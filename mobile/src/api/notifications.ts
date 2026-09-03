import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "./client";
import { getSocket } from "./socket";
import type { AppNotification, Paginated } from "../types";

export function useNotifications() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const socket = getSocket();
    const onNew = () => queryClient.invalidateQueries({ queryKey: ["notifications"] });
    socket.on("notification:new", onNew);
    return () => {
      socket.off("notification:new", onNew);
    };
  }, [queryClient]);

  return useQuery({
    queryKey: ["notifications"],
    queryFn: async () => (await apiClient.get<Paginated<AppNotification>>("/notifications")).data,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => apiClient.post(`/notifications/${id}/read`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => apiClient.post("/notifications/read-all"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
}
