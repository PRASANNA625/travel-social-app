import type { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";

export type AuditTarget = "USER" | "TRIP" | "REPORT" | "FEEDBACK" | "REVIEW" | "COMMENT" | "MESSAGE" | "JOIN_REQUEST" | "CONNECTION" | "GROUP_MEMBER" | "ANNOUNCEMENT" | "SETTINGS" | "EXPORT" | "HERO_BANNER";

// Records one administrative action. Called after the action succeeds, so the
// log only ever describes things that actually happened.
export async function logAction(
  actorId: string,
  action: string,
  targetType: AuditTarget,
  targetId: string | null,
  details?: Record<string, unknown>
) {
  await prisma.auditLog.create({
    data: {
      actorId,
      action,
      targetType,
      targetId,
      details: details as Prisma.InputJsonValue | undefined,
    },
  });
}
