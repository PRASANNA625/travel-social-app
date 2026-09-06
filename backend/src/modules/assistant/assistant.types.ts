import { z } from "zod";

export const assistantMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(4000),
});

export const assistantRequestSchema = z.object({
  messages: z.array(assistantMessageSchema).min(1).max(50),
});

export type AssistantMessage = z.infer<typeof assistantMessageSchema>;
