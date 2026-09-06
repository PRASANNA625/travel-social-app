import { useMutation } from "@tanstack/react-query";
import { apiClient } from "./client";
import type { AssistantMessage } from "../types";

export function useAssistantReply() {
  return useMutation({
    mutationFn: async (messages: AssistantMessage[]) =>
      (await apiClient.post<AssistantMessage>("/assistant/messages", { messages })).data,
  });
}
