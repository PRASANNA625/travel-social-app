import { z } from "zod";

export const reportReasons = [
  "SPAM",
  "HARASSMENT",
  "FAKE_PROFILE",
  "INAPPROPRIATE_CONTENT",
  "SAFETY_CONCERN",
  "OTHER",
] as const;

export const reportSchema = z
  .object({
    reason: z.enum(reportReasons),
    details: z.string().max(1000).optional(),
  })
  .refine((data) => data.reason !== "OTHER" || !!data.details?.trim(), {
    message: "Please provide details when selecting 'Other'",
    path: ["details"],
  });

export type ReportInput = z.infer<typeof reportSchema>;
export type ReportReason = (typeof reportReasons)[number];
