import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { ImagePickerAsset } from "expo-image-picker";
import { apiClient } from "./client";
import { getSocket } from "./socket";
import { appendImageAsset } from "../utils/formDataImage";
import type { ChatMessage, MessageReactionSummary, Paginated, PresenceInfo } from "../types";

export function useMessageHistory(groupId?: string) {
  return useQuery({
    queryKey: ["messages", groupId],
    queryFn: async () => (await apiClient.get<Paginated<ChatMessage>>(`/messages/groups/${groupId}`)).data,
    enabled: !!groupId,
  });
}

export function useUploadChatImage() {
  return useMutation({
    mutationFn: async (asset: ImagePickerAsset) => {
      const form = new FormData();
      appendImageAsset(form, "image", asset, "chat.jpg");
      const { data } = await apiClient.post<{ url: string }>("/messages/images", form);
      return data.url;
    },
  });
}

export function useLiveGroupChat(
  groupId: string | undefined,
  initialMessages: ChatMessage[],
  memberIds: string[] = []
) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [presence, setPresence] = useState<Record<string, PresenceInfo>>({});
  // Joining depends on which members exist, but memberIds is a fresh array
  // reference on every render (the caller derives it from group.members) -
  // joining it into a string gives the effect a stable primitive to depend
  // on instead of re-subscribing to sockets every render.
  const memberIdsKey = memberIds.join(",");

  useEffect(() => {
    setMessages(initialMessages);
  }, [initialMessages]);

  useEffect(() => {
    if (!groupId) return;
    const socket = getSocket();
    socket.emit("group:join", groupId);
    if (memberIdsKey) {
      socket.emit("presence:get", { userIds: memberIdsKey.split(",") });
    }

    const onNewMessage = (message: ChatMessage) => {
      if (message.groupId !== groupId) return;
      setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
    };

    const onReactionUpdated = (data: { messageId: string; reactions: MessageReactionSummary[] }) => {
      setMessages((prev) => prev.map((m) => (m.id === data.messageId ? { ...m, reactions: data.reactions } : m)));
    };

    const onPresenceSnapshot = (snapshot: Record<string, PresenceInfo>) => {
      setPresence((prev) => ({ ...prev, ...snapshot }));
    };

    const onPresenceUpdate = (update: { userId: string; online: boolean; lastSeenAt: string | null }) => {
      setPresence((prev) => ({
        ...prev,
        [update.userId]: { online: update.online, lastSeenAt: update.lastSeenAt },
      }));
    };

    socket.on("message:new", onNewMessage);
    socket.on("reaction:updated", onReactionUpdated);
    socket.on("presence:snapshot", onPresenceSnapshot);
    socket.on("presence:update", onPresenceUpdate);
    return () => {
      socket.off("message:new", onNewMessage);
      socket.off("reaction:updated", onReactionUpdated);
      socket.off("presence:snapshot", onPresenceSnapshot);
      socket.off("presence:update", onPresenceUpdate);
      socket.emit("group:leave", groupId);
    };
  }, [groupId, memberIdsKey]);

  const sendMessage = (input: { content?: string; type?: "TEXT" | "IMAGE"; mediaUrl?: string }) => {
    if (!groupId) return;
    getSocket().emit("message:send", { groupId, ...input });
  };

  const toggleReaction = (messageId: string, emoji: string) => {
    getSocket().emit("reaction:toggle", { messageId, emoji });
  };

  return { messages, sendMessage, presence, toggleReaction };
}
