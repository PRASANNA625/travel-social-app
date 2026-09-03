import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiClient } from "./client";
import { getSocket } from "./socket";
import type { ChatMessage, Paginated } from "../types";

export function useMessageHistory(groupId?: string) {
  return useQuery({
    queryKey: ["messages", groupId],
    queryFn: async () => (await apiClient.get<Paginated<ChatMessage>>(`/messages/groups/${groupId}`)).data,
    enabled: !!groupId,
  });
}

export function useUploadChatImage() {
  return useMutation({
    mutationFn: async (uri: string) => {
      const form = new FormData();
      form.append("image", { uri, name: "chat.jpg", type: "image/jpeg" } as unknown as Blob);
      const { data } = await apiClient.post<{ url: string }>("/messages/images", form);
      return data.url;
    },
  });
}

export function useLiveGroupChat(groupId: string | undefined, initialMessages: ChatMessage[]) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);

  useEffect(() => {
    setMessages(initialMessages);
  }, [initialMessages]);

  useEffect(() => {
    if (!groupId) return;
    const socket = getSocket();
    socket.emit("group:join", groupId);

    const onNewMessage = (message: ChatMessage) => {
      if (message.groupId !== groupId) return;
      setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
    };

    socket.on("message:new", onNewMessage);
    return () => {
      socket.off("message:new", onNewMessage);
      socket.emit("group:leave", groupId);
    };
  }, [groupId]);

  const sendMessage = (input: { content?: string; type?: "TEXT" | "IMAGE"; mediaUrl?: string }) => {
    if (!groupId) return;
    getSocket().emit("message:send", { groupId, ...input });
  };

  return { messages, sendMessage };
}
