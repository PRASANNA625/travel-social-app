import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { emitToUser } from "../../config/socket";
import { parsePageParams } from "../../utils/pagination";
import { logAction } from "./audit";

const DAY_MS = 24 * 60 * 60 * 1000;

// --- Daily series ---------------------------------------------------------------

type CountedTable = "User" | "Trip" | "JoinRequest" | "Message" | "BuddyConnection";

// Rows created per day over the last `days` days (UTC), zero-filled. Counts only:
// message contents are never read.
async function dailyCounts(table: CountedTable, days: number) {
  const since = new Date(Date.now() - (days - 1) * DAY_MS);
  since.setUTCHours(0, 0, 0, 0);
  const rows = await prisma.$queryRaw<{ day: Date; count: bigint }[]>`
    SELECT date_trunc('day', "createdAt") AS day, COUNT(*)::bigint AS count
    FROM ${Prisma.raw(`"${table}"`)}
    WHERE "createdAt" >= ${since}
    GROUP BY 1
    ORDER BY 1`;
  const byDay = new Map(rows.map((r) => [r.day.toISOString().slice(0, 10), Number(r.count)]));
  return Array.from({ length: days }, (_, i) => {
    const day = new Date(since.getTime() + i * DAY_MS).toISOString().slice(0, 10);
    return { day, count: byDay.get(day) ?? 0 };
  });
}

// --- Overview -----------------------------------------------------------------------

export async function getOverview() {
  const weekAgo = new Date(Date.now() - 7 * DAY_MS);
  const [
    totalUsers,
    newUsers7d,
    suspendedUsers,
    activeTrips,
    upcomingTrips,
    pendingJoinRequests,
    pendingConnections,
    openReports,
    newFeedback,
    signups,
    tripsCreated,
    recentActivity,
    recentUsers,
    recentTrips,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: weekAgo } } }),
    prisma.user.count({ where: { status: "SUSPENDED" } }),
    prisma.trip.count({ where: { status: { in: ["OPEN", "ALMOST_FULL", "FULL", "STARTED"] } } }),
    prisma.trip.count({ where: { startDate: { gte: new Date() }, status: { notIn: ["CANCELLED", "COMPLETED"] } } }),
    prisma.joinRequest.count({ where: { status: "PENDING" } }),
    prisma.buddyConnection.count({ where: { status: "PENDING" } }),
    prisma.userReport.count({ where: { status: "OPEN" } }),
    prisma.appFeedback.count({ where: { status: "NEW" } }),
    dailyCounts("User", 30),
    dailyCounts("Trip", 30),
    prisma.auditLog.findMany({
      select: { id: true, action: true, targetType: true, targetId: true, createdAt: true, actor: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    prisma.user.findMany({
      select: { id: true, name: true, photoUrl: true, location: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.trip.findMany({
      select: { id: true, title: true, destination: true, status: true, createdAt: true, owner: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);
  return {
    stats: {
      totalUsers,
      newUsers7d,
      suspendedUsers,
      activeTrips,
      upcomingTrips,
      pendingJoinRequests,
      pendingConnections,
      openReports,
      newFeedback,
    },
    series: { signups, tripsCreated },
    recentActivity,
    recentUsers,
    recentTrips,
  };
}

// Counts behind the dashboard's notification bell.
export async function getAlerts() {
  const [openReports, newFeedback, pendingJoinRequests] = await Promise.all([
    prisma.userReport.count({ where: { status: "OPEN" } }),
    prisma.appFeedback.count({ where: { status: "NEW" } }),
    prisma.joinRequest.count({ where: { status: "PENDING", createdAt: { lte: new Date(Date.now() - 3 * DAY_MS) } } }),
  ]);
  return { openReports, newFeedback, staleJoinRequests: pendingJoinRequests };
}

// --- Analytics ----------------------------------------------------------------------

export async function getAnalytics(days: number) {
  const since = new Date(Date.now() - days * DAY_MS);
  const [signups, tripsCreated, joinRequests, messages, connections, destinations, modes, activeUsers] = await Promise.all([
    dailyCounts("User", days),
    dailyCounts("Trip", days),
    dailyCounts("JoinRequest", days),
    dailyCounts("Message", days),
    dailyCounts("BuddyConnection", days),
    prisma.trip.groupBy({
      by: ["destination"],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
      orderBy: { _count: { destination: "desc" } },
      take: 10,
    }),
    prisma.trip.groupBy({
      by: ["travelMode"],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
      orderBy: { _count: { travelMode: "desc" } },
    }),
    prisma.user.count({ where: { lastSeenAt: { gte: since } } }),
  ]);
  return {
    days,
    series: { signups, tripsCreated, joinRequests, messages, connections },
    popularDestinations: destinations.map((d) => ({ destination: d.destination, trips: d._count._all })),
    travelModes: modes.map((m) => ({ travelMode: m.travelMode, trips: m._count._all })),
    activeUsers,
  };
}

// --- CSV export ---------------------------------------------------------------------

function csv(rows: (string | number | null | undefined)[][]) {
  const cell = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? "" : String(v);
    // Quote everything, and defuse spreadsheet formulas (=, +, -, @) in user-entered text.
    const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  return rows.map((r) => r.map(cell).join(",")).join("\r\n");
}

export async function exportReport(actorId: string, type: "users" | "trips" | "destinations") {
  let body: string;
  if (type === "users") {
    // Contact details stay out of exports; admins can look them up per account.
    const users = await prisma.user.findMany({
      select: { id: true, name: true, location: true, role: true, status: true, createdAt: true, lastSeenAt: true, _count: { select: { trips: true } } },
      orderBy: { createdAt: "asc" },
    });
    body = csv([
      ["id", "name", "location", "role", "status", "trips", "joined", "last_seen"],
      ...users.map((u) => [u.id, u.name, u.location, u.role, u.status, u._count.trips, u.createdAt.toISOString(), u.lastSeenAt?.toISOString()]),
    ]);
  } else if (type === "trips") {
    const trips = await prisma.trip.findMany({
      select: {
        id: true, title: true, destination: true, travelMode: true, status: true, startDate: true, endDate: true,
        seats: true, seatsFilled: true, featured: true, hidden: true, createdAt: true, owner: { select: { name: true } },
      },
      orderBy: { createdAt: "asc" },
    });
    body = csv([
      ["id", "title", "destination", "travel_mode", "status", "start", "end", "seats", "seats_filled", "featured", "hidden", "organizer", "created"],
      ...trips.map((t) => [
        t.id, t.title, t.destination, t.travelMode, t.status, t.startDate.toISOString(), t.endDate.toISOString(),
        t.seats, t.seatsFilled, String(t.featured), String(t.hidden), t.owner.name, t.createdAt.toISOString(),
      ]),
    ]);
  } else {
    const rows = await prisma.trip.groupBy({ by: ["destination"], _count: { _all: true }, orderBy: { _count: { destination: "desc" } } });
    body = csv([["destination", "trips"], ...rows.map((r) => [r.destination, r._count._all])]);
  }
  await logAction(actorId, "export.download", "EXPORT", null, { type });
  return body;
}

// --- Announcements ------------------------------------------------------------------

export type AnnouncementAudience = "ALL" | "ACTIVE_30D" | "ORGANIZERS" | "STAFF";

function audienceWhere(audience: AnnouncementAudience): Prisma.UserWhereInput {
  const base: Prisma.UserWhereInput = { status: "ACTIVE" };
  if (audience === "ACTIVE_30D") return { ...base, lastSeenAt: { gte: new Date(Date.now() - 30 * DAY_MS) } };
  if (audience === "ORGANIZERS") return { ...base, trips: { some: {} } };
  if (audience === "STAFF") return { ...base, role: { not: "USER" } };
  return base;
}

export async function audienceSize(audience: AnnouncementAudience) {
  return prisma.user.count({ where: audienceWhere(audience) });
}

// Delivered as an in-app notification to every account in the audience.
export async function sendAnnouncement(actorId: string, input: { title: string; body: string; audience: AnnouncementAudience }) {
  const recipients = await prisma.user.findMany({ where: audienceWhere(input.audience), select: { id: true } });
  const announcement = await prisma.announcement.create({
    data: { ...input, recipientCount: recipients.length, createdById: actorId },
  });
  const payload = { announcementId: announcement.id, title: input.title, body: input.body };
  await prisma.notification.createMany({
    data: recipients.map((r) => ({ userId: r.id, type: "SYSTEM_ANNOUNCEMENT", payload })),
  });
  for (const r of recipients) emitToUser(r.id, "notification:new", { type: "SYSTEM_ANNOUNCEMENT", payload });
  await logAction(actorId, "announcement.send", "ANNOUNCEMENT", announcement.id, {
    audience: input.audience,
    recipients: recipients.length,
  });
  return announcement;
}

export async function listAnnouncements(filters: { page?: number; pageSize?: number }) {
  const params = parsePageParams(filters as Record<string, unknown>, 20, 100);
  const [items, total] = await Promise.all([
    prisma.announcement.findMany({
      select: { id: true, title: true, body: true, audience: true, recipientCount: true, createdAt: true, createdBy: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
    }),
    prisma.announcement.count(),
  ]);
  return { items, total, ...params };
}

// How many notifications of each type went out recently (for the Notifications page).
export async function notificationStats(days = 30) {
  const rows = await prisma.notification.groupBy({
    by: ["type"],
    where: { createdAt: { gte: new Date(Date.now() - days * DAY_MS) } },
    _count: { _all: true },
    orderBy: { _count: { type: "desc" } },
  });
  return rows.map((r) => ({ type: r.type, count: r._count._all }));
}

// --- Audit log ------------------------------------------------------------------------

export async function listAudit(filters: { page?: number; pageSize?: number; action?: string; actorId?: string; targetType?: string }) {
  const params = parsePageParams(filters as Record<string, unknown>, 30, 100);
  const where: Prisma.AuditLogWhereInput = {};
  if (filters.action) where.action = { startsWith: filters.action };
  if (filters.actorId) where.actorId = filters.actorId;
  if (filters.targetType) where.targetType = filters.targetType;
  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      select: { id: true, action: true, targetType: true, targetId: true, details: true, createdAt: true, actor: { select: { id: true, name: true, role: true } } },
      orderBy: { createdAt: "desc" },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
    }),
    prisma.auditLog.count({ where }),
  ]);
  return { items, total, ...params };
}
