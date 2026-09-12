import { prisma } from "../../config/prisma";
import type { CreateFeedbackInput } from "./feedback.types";

export async function createFeedback(userId: string, input: CreateFeedbackInput, screenshotUrl: string | null) {
  const feedback = await prisma.appFeedback.create({
    data: {
      userId,
      kind: input.kind,
      type: input.type,
      description: input.description,
      screenshotUrl,
      appVersion: input.appVersion,
      platform: input.platform,
    },
  });
  return {
    id: feedback.id,
    kind: feedback.kind,
    type: feedback.type,
    status: feedback.status,
    createdAt: feedback.createdAt,
  };
}
