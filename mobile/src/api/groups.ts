import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "./client";
import { getSocket } from "./socket";
import type { Group, GroupInboxItem } from "../types";

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

// Messages inbox. Chat notifications arrive over the socket, so refresh the inbox
// (last message + unread counts) whenever one is created or cleared.
export function useMyGroups() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const socket = getSocket();
    const onChange = () => queryClient.invalidateQueries({ queryKey: ["groups", "mine"] });
    socket.on("notification:new", onChange);
    socket.on("notification:removed", onChange);
    return () => {
      socket.off("notification:new", onChange);
      socket.off("notification:removed", onChange);
    };
  }, [queryClient]);

  return useQuery({
    queryKey: ["groups", "mine"],
    queryFn: async () => (await apiClient.get<{ items: GroupInboxItem[] }>("/groups/mine")).data.items,
  });
}
