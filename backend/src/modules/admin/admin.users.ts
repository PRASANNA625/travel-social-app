import type { AccountStatus, Prisma, UserRole } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { HttpError } from "../../middleware/error";
import { ROLE_RANK, invalidateAccountCache } from "../../middleware/auth";
import { emitToUser } from "../../config/socket";
import { parsePageParams } from "../../utils/pagination";
import { logAction } from "./audit";

// What admins see of an account. Never includes password hashes or OAuth ids.
const adminUserSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  photoUrl: true,
  location: true,
  bio: true,
  age: true,
  interests: true,
  preferredModes: true,
  role: true,
  status: true,
  suspendedAt: true,
  suspendedReason: true,
  lastSeenAt: true,
  createdAt: true,
  _count: { select: { trips: true, reportsReceived: true, groupMemberships: true } },
} satisfies Prisma.UserSelect;

export interface UserListFilters {
  search?: string;
  role?: UserRole;
  status?: AccountStatus;
  page?: number;
  pageSize?: number;
}

export async function listUsers(filters: UserListFilters) {
  const pageParams = parsePageParams(filters as Record<string, unknown>, 20, 100);
  const where: Prisma.UserWhereInput = {};
  if (filters.search) {
    where.OR = [
      { name: { contains: filters.search, mode: "insensitive" } },
      { email: { contains: filters.search, mode: "insensitive" } },
      { phone: { contains: filters.search } },
      { location: { contains: filters.search, mode: "insensitive" } },
    ];
  }
  if (filters.role) where.role = filters.role;
  if (filters.status) where.status = filters.status;

  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: adminUserSelect,
      orderBy: { createdAt: "desc" },
      skip: (pageParams.page - 1) * pageParams.pageSize,
      take: pageParams.pageSize,
    }),
    prisma.user.count({ where }),
  ]);
  return { items, total, ...pageParams };
}

export async function getUserDetail(id: string) {
  const user = await prisma.user.findUnique({ where: { id }, select: adminUserSelect });
  if (!user) throw new HttpError(404, "User not found");
  const [trips, reportsReceived, reportsMade, auditTrail] = await Promise.all([
    prisma.trip.findMany({
      where: { ownerId: id },
      select: { id: true, title: true, destination: true, status: true, startDate: true, hidden: true, featured: true },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prisma.userReport.findMany({
      where: { reportedId: id },
      select: { id: true, reason: true, details: true, status: true, createdAt: true, reporter: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prisma.userReport.count({ where: { reporterId: id } }),
    prisma.auditLog.findMany({
      where: { targetType: "USER", targetId: id },
      select: { id: true, action: true, details: true, createdAt: true, actor: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);
  return { ...user, trips, reportsReceived, reportsMadeCount: reportsMade, auditTrail };
}

// Admins act only on accounts ranked below them (Super Admins on anyone but
// themselves for destructive actions), so a moderator can't suspend an admin.
async function loadTarget(actorId: string, actorRole: UserRole, targetId: string) {
  const target = await prisma.user.findUnique({ where: { id: targetId }, select: { id: true, role: true, status: true, name: true } });
  if (!target) throw new HttpError(404, "User not found");
  if (target.id === actorId) throw new HttpError(400, "You can't do this to your own account");
  if (actorRole !== "SUPER_ADMIN" && ROLE_RANK[target.role] >= ROLE_RANK[actorRole]) {
    throw new HttpError(403, "You can only manage accounts with a lower role than yours");
  }
  return target;
}

export interface AdminUserUpdate {
  name?: string;
  location?: string | null;
  bio?: string | null;
}

export async function updateUser(actorId: string, actorRole: UserRole, id: string, data: AdminUserUpdate) {
  await loadTarget(actorId, actorRole, id);
  const user = await prisma.user.update({ where: { id }, data, select: adminUserSelect });
  await logAction(actorId, "user.update", "USER", id, { fields: Object.keys(data) });
  return user;
}

export async function suspendUser(actorId: string, actorRole: UserRole, id: string, reason: string) {
  const target = await loadTarget(actorId, actorRole, id);
  if (target.status === "SUSPENDED") throw new HttpError(409, "This account is already suspended");
  const user = await prisma.user.update({
    where: { id },
    data: { status: "SUSPENDED", suspendedAt: new Date(), suspendedReason: reason },
    select: adminUserSelect,
  });
  invalidateAccountCache(id);
  // Live sessions are told right away; their next API call is rejected anyway.
  emitToUser(id, "account:suspended", { reason });
  await logAction(actorId, "user.suspend", "USER", id, { reason });
  return user;
}

export async function activateUser(actorId: string, actorRole: UserRole, id: string) {
  const target = await loadTarget(actorId, actorRole, id);
  if (target.status === "ACTIVE") throw new HttpError(409, "This account is already active");
  const user = await prisma.user.update({
    where: { id },
    data: { status: "ACTIVE", suspendedAt: null, suspendedReason: null },
    select: adminUserSelect,
  });
  invalidateAccountCache(id);
  await logAction(actorId, "user.activate", "USER", id);
  return user;
}

export async function setUserRole(actorId: string, id: string, role: UserRole) {
  if (id === actorId) throw new HttpError(400, "You can't change your own role");
  const target = await prisma.user.findUnique({ where: { id }, select: { role: true } });
  if (!target) throw new HttpError(404, "User not found");
  if (target.role === role) throw new HttpError(409, "The account already has this role");
  const user = await prisma.user.update({ where: { id }, data: { role }, select: adminUserSelect });
  await logAction(actorId, "user.role_change", "USER", id, { from: target.role, to: role });
  return user;
}

export async function bulkSetStatus(
  actorId: string,
  actorRole: UserRole,
  ids: string[],
  action: "suspend" | "activate",
  reason?: string
) {
  const results: { id: string; ok: boolean; error?: string }[] = [];
  for (const id of ids) {
    try {
      if (action === "suspend") await suspendUser(actorId, actorRole, id, reason ?? "Bulk suspension");
      else await activateUser(actorId, actorRole, id);
      results.push({ id, ok: true });
    } catch (err) {
      results.push({ id, ok: false, error: err instanceof HttpError ? err.message : "Failed" });
    }
  }
  return { results, succeeded: results.filter((r) => r.ok).length };
}

export async function listStaff() {
  return prisma.user.findMany({
    where: { role: { not: "USER" } },
    select: adminUserSelect,
    orderBy: [{ role: "desc" }, { name: "asc" }],
  });
}
