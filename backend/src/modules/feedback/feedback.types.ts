import { z } from "zod";

export const REPORT_TYPES = ["bug", "chat", "notification", "location", "login", "ui", "other"] as const;
export const FEEDBACK_TYPES = ["suggestion", "improvement", "general"] as const;

export const createFeedbackSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("REPORT"),
    type: z.enum(REPORT_TYPES),
    description: z.string().trim().min(1, "Description is required"),
    appVersion: z.string().max(50),
    platform: z.enum(["ios", "android", "web"]),
  }),
  z.object({
    kind: z.literal("FEEDBACK"),
    type: z.enum(FEEDBACK_TYPES),
    description: z.string().trim().min(1, "Description is required"),
    appVersion: z.string().max(50),
    platform: z.enum(["ios", "android", "web"]),
  }),
]);

export type CreateFeedbackInput = z.infer<typeof createFeedbackSchema>;
