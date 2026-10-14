import type { BuddyConnectionStatus, FeedbackKind, FeedbackStatus, Prisma, ReportReason, ReportStatus, UserRole } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { HttpError } from "../../middleware/error";
import { parsePageParams } from "../../utils/pagination";
import { emitToGroup } from "../../config/socket";
import { notify } from "../notifications/notify";
import { logAction } from "./audit";
import { suspendUser } from "./admin.users";

const personSelect = { id: true, name: true, photoUrl: true, email: true, status: true, role: true } satisfies Prisma.UserSelect;

interface Paged {
  page?: number;
  pageSize?: number;
}

function paging(filters: Paged) {
  const params = parsePageParams(filters as Record<string, unknown>, 20, 100);
  return { params, skip: (params.page - 1) * params.pageSize, take: params.pageSize };
}

// --- User reports -------------------------------------------------------------
// Moderators see the report (who, about whom, reason, details) and the reported
// account's history. For a message report they see that one message (the
// snapshot taken when it was reported) - never the rest of the conversation.

export async function listReports(filters: Paged & { status?: ReportStatus; reason?: ReportReason }) {
  const { params, skip, take } = paging(filters);
  const where: Prisma.UserReportWhereInput = {};
  if (filters.status) where.status = filters.status;
  if (filters.reason) where.reason = filters.reason;
  const [items, total] = await Promise.all([
    prisma.userReport.findMany({
      where,
      select: {
        id: true,
        reason: true,
        details: true,
        status: true,
        resolutionNote: true,
        resolvedAt: true,
        createdAt: true,
        reporter: { select: personSelect },
        reported: { select: { ...personSelect, _count: { select: { reportsReceived: true } } } },
        resolvedBy: { select: { id: true, name: true } },
        messageId: true,
        messageSnapshot: true,
        message: { select: { removedAt: true, removedBy: { select: { id: true, name: true } } } },
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      skip,
      take,
    }),
    prisma.userReport.count({ where }),
  ]);
  return { items, total, ...params };
}

// Hides a chat message's content from everyone in the chat (the report keeps its
// snapshot as evidence). Members see "removed by moderators" in its place.
export async function removeMessage(actorId: string, messageId: string, reason: string) {
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: { id: true, groupId: true, senderId: true, removedAt: true, group: { select: { trip: { select: { id: true, title: true } } } } },
  });
  if (!message) throw new HttpError(404, "Message not found");
  if (message.removedAt) throw new HttpError(409, "This message was already removed");
  const removedAt = new Date();
  await prisma.message.update({ where: { id: messageId }, data: { removedAt, removedById: actorId } });
  emitToGroup(message.groupId, "message:removed", { id: messageId, groupId: message.groupId, removedAt: removedAt.toISOString() });
  await notify(message.senderId, "MESSAGE_REMOVED_BY_ADMIN", { tripId: message.group.trip.id, tripTitle: message.group.trip.title, reason });
  await logAction(actorId, "message.remove", "MESSAGE", messageId, { groupId: message.groupId, senderId: message.senderId, reason });
  return { id: messageId, removedAt };
}

export async function resolveReport(
  actorId: string,
  actorRole: UserRole,
  id: string,
  input: { status: ReportStatus; note?: string; suspendReported?: boolean }
) {
  const report = await prisma.userReport.findUnique({ where: { id }, select: { id: true, reportedId: true, reason: true } });
  if (!report) throw new HttpError(404, "Report not found");

  // Suspending first: if the actor isn't allowed to, the report stays untouched.
  if (input.status === "RESOLVED" && input.suspendReported) {
    await suspendUser(actorId, actorRole, report.reportedId, input.note || `Report: ${report.reason}`);
  }
  const resolved = input.status !== "OPEN";
  const updated = await prisma.userReport.update({
    where: { id },
    data: {
      status: input.status,
      resolutionNote: input.note ?? null,
      resolvedById: resolved ? actorId : null,
      resolvedAt: resolved ? new Date() : null,
    },
  });
  await logAction(actorId, `report.${input.status.toLowerCase()}`, "REPORT", id, {
    reportedId: report.reportedId,
    suspended: !!input.suspendReported,
    note: input.note,
  });
  return updated;
}

// --- Travel buddies -----------------------------------------------------------

export async function listConnections(filters: Paged & { status?: BuddyConnectionStatus; search?: string }) {
  const { params, skip, take } = paging(filters);
  const where: Prisma.BuddyConnectionWhereInput = {};
  if (filters.status) where.status = filters.status;
  if (filters.search) {
    where.OR = [
      { fromUser: { name: { contains: filters.search, mode: "insensitive" } } },
      { toUser: { name: { contains: filters.search, mode: "insensitive" } } },
    ];
  }
  const [items, total] = await Promise.all([
    prisma.buddyConnection.findMany({
      where,
      select: {
        id: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        fromUser: { select: personSelect },
        toUser: { select: personSelect },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.buddyConnection.count({ where }),
  ]);
  return { items, total, ...params };
}

export async function deleteConnection(actorId: string, id: string) {
  const connection = await prisma.buddyConnection.findUnique({ where: { id }, select: { fromUserId: true, toUserId: true, status: true } });
  if (!connection) throw new HttpError(404, "Connection not found");
  await prisma.buddyConnection.delete({ where: { id } });
  await logAction(actorId, "connection.delete", "CONNECTION", id, connection);
}

// Accounts worth a closer look: reported repeatedly, or sending unusually many
// buddy requests in the last day (a common spam pattern).
const FLAG_REPORTS_THRESHOLD = 2;
const FLAG_REQUESTS_PER_DAY = 20;

export async function listFlaggedAccounts() {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [reported, requesters] = await Promise.all([
    prisma.userReport.groupBy({
      by: ["reportedId"],
      where: { status: "OPEN" },
      _count: { _all: true },
      having: { reportedId: { _count: { gte: FLAG_REPORTS_THRESHOLD } } },
    }),
    prisma.buddyConnection.groupBy({
      by: ["fromUserId"],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
      having: { fromUserId: { _count: { gte: FLAG_REQUESTS_PER_DAY } } },
    }),
  ]);
  const reasons = new Map<string, string[]>();
  for (const r of reported) reasons.set(r.reportedId, [`${r._count._all} open reports`]);
  for (const r of requesters) {
    reasons.set(r.fromUserId, [...(reasons.get(r.fromUserId) ?? []), `${r._count._all} buddy requests in 24h`]);
  }
  if (reasons.size === 0) return [];
  const users = await prisma.user.findMany({
    where: { id: { in: [...reasons.keys()] } },
    select: { ...personSelect, location: true, createdAt: true, _count: { select: { reportsReceived: true } } },
  });
  return users.map((u) => ({ ...u, flags: reasons.get(u.id) ?? [] }));
}

// --- Reviews, comments and app feedback -----------------------------------------

export async function listReviews(filters: Paged & { search?: string; maxRating?: number }) {
  const { params, skip, take } = paging(filters);
  const where: Prisma.TripReviewWhereInput = {};
  if (filters.search) where.comment = { contains: filters.search, mode: "insensitive" };
  if (filters.maxRating) where.rating = { lte: filters.maxRating };
  const [items, total] = await Promise.all([
    prisma.tripReview.findMany({
      where,
      select: {
        tripId: true,
        userId: true,
        rating: true,
        comment: true,
        createdAt: true,
        user: { select: personSelect },
        trip: { select: { id: true, title: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.tripReview.count({ where }),
  ]);
  return { items, total, ...params };
}

export async function deleteReview(actorId: string, tripId: string, userId: string, reason: string) {
  const review = await prisma.tripReview.findUnique({ where: { tripId_userId: { tripId, userId } } });
  if (!review) throw new HttpError(404, "Review not found");
  await prisma.$transaction(async (tx) => {
    await tx.tripReview.delete({ where: { tripId_userId: { tripId, userId } } });
    // Keep the trip's cached rating in step with its remaining reviews.
    const agg = await tx.tripReview.aggregate({ where: { tripId }, _avg: { rating: true }, _count: { _all: true } });
    await tx.trip.update({ where: { id: tripId }, data: { avgRating: agg._avg.rating, reviewCount: agg._count._all } });
  });
  await logAction(actorId, "review.delete", "REVIEW", `${tripId}:${userId}`, { rating: review.rating, reason });
}

export async function listComments(filters: Paged & { search?: string }) {
  const { params, skip, take } = paging(filters);
  const where: Prisma.TripCommentWhereInput = {};
  if (filters.search) where.text = { contains: filters.search, mode: "insensitive" };
  const [items, total] = await Promise.all([
    prisma.tripComment.findMany({
      where,
      select: { id: true, text: true, createdAt: true, user: { select: personSelect }, trip: { select: { id: true, title: true } } },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.tripComment.count({ where }),
  ]);
  return { items, total, ...params };
}

export async function deleteComment(actorId: string, id: string, reason: string) {
  const comment = await prisma.tripComment.findUnique({ where: { id }, select: { tripId: true, userId: true } });
  if (!comment) throw new HttpError(404, "Comment not found");
  await prisma.tripComment.delete({ where: { id } });
  await logAction(actorId, "comment.delete", "COMMENT", id, { ...comment, reason });
}

export async function listFeedback(filters: Paged & { status?: FeedbackStatus; kind?: FeedbackKind }) {
  const { params, skip, take } = paging(filters);
  const where: Prisma.AppFeedbackWhereInput = {};
  if (filters.status) where.status = filters.status;
  if (filters.kind) where.kind = filters.kind;
  const [items, total] = await Promise.all([
    prisma.appFeedback.findMany({
      where,
      select: {
        id: true,
        kind: true,
        type: true,
        description: true,
        screenshotUrl: true,
        appVersion: true,
        platform: true,
        status: true,
        createdAt: true,
        user: { select: personSelect },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.appFeedback.count({ where }),
  ]);
  return { items, total, ...params };
}

export async function setFeedbackStatus(actorId: string, id: string, status: FeedbackStatus) {
  const existing = await prisma.appFeedback.findUnique({ where: { id }, select: { status: true } });
  if (!existing) throw new HttpError(404, "Feedback not found");
  const updated = await prisma.appFeedback.update({ where: { id }, data: { status } });
  await logAction(actorId, "feedback.status", "FEEDBACK", id, { from: existing.status, to: status });
  return updated;
}
