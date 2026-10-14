import type { NextFunction, Request, Response } from "express";
import type { UserRole } from "@prisma/client";
import { verifyToken } from "../utils/jwt";
import { prisma } from "../config/prisma";

export interface AuthedRequest extends Request {
  userId?: string;
  // Set by requireRole: the caller's role as stored in the database.
  userRole?: UserRole;
}

// Roles from least to most privileged; a role includes everything below it.
export const ROLE_RANK: Record<UserRole, number> = { USER: 0, MODERATOR: 1, ADMIN: 2, SUPER_ADMIN: 3 };

// Account status is checked on every authenticated request so a suspension takes
// effect immediately, not when the user's token expires. A short cache keeps that
// from costing a database query per request; admin actions clear it.
const STATUS_TTL_MS = 15_000;
const statusCache = new Map<string, { suspended: boolean; at: number }>();

export function invalidateAccountCache(userId: string) {
  statusCache.delete(userId);
}

export async function isSuspended(userId: string): Promise<boolean> {
  const cached = statusCache.get(userId);
  if (cached && Date.now() - cached.at < STATUS_TTL_MS) return cached.suspended;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { status: true } });
  // A deleted account counts as suspended: its token must stop working too.
  const suspended = !user || user.status === "SUSPENDED";
  statusCache.set(userId, { suspended, at: Date.now() });
  return suspended;
}

export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid Authorization header" });
  }
  let userId: string;
  try {
    userId = verifyToken(header.slice("Bearer ".length)).sub;
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
  try {
    if (await isSuspended(userId)) {
      return res.status(403).json({ error: "This account has been suspended", code: "ACCOUNT_SUSPENDED" });
    }
  } catch (err) {
    return next(err);
  }
  req.userId = userId;
  next();
}

export function optionalAuth(req: AuthedRequest, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    try {
      req.userId = verifyToken(header.slice("Bearer ".length)).sub;
    } catch {
      // ignore invalid token on optional routes
    }
  }
  next();
}

// Admin authorization. Use after requireAuth. The role is read from the database
// on every request (not from the token), so promotions and demotions apply at once.
export function requireRole(minimum: UserRole) {
  return async (req: AuthedRequest, res: Response, next: NextFunction) => {
    try {
      const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { role: true } });
      if (!user || ROLE_RANK[user.role] < ROLE_RANK[minimum]) {
        return res.status(403).json({ error: "You don't have permission to do this", code: "FORBIDDEN" });
      }
      req.userRole = user.role;
      next();
    } catch (err) {
      next(err);
    }
  };
}
