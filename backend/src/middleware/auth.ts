import type { NextFunction, Request, Response } from "express";
import type { UserRole } from "@prisma/client";
import { verifyToken, type TokenClaims } from "../utils/jwt";
import { prisma } from "../config/prisma";

export interface AuthedRequest extends Request {
  userId?: string;
  // Set by requireRole: the caller's role as stored in the database.
  userRole?: UserRole;
}

// Roles from least to most privileged; a role includes everything below it.
export const ROLE_RANK: Record<UserRole, number> = { USER: 0, MODERATOR: 1, ADMIN: 2, SUPER_ADMIN: 3 };

// Account status and password stamp are checked on every authenticated request, so a
// suspension or password change takes effect immediately, not when the token expires.
// A short cache keeps that from costing a database query per request; admin and
// password actions clear it.
const STATUS_TTL_MS = 15_000;
export interface AccountState {
  suspended: boolean;
  passwordStamp: number;
}
const accountCache = new Map<string, AccountState & { at: number }>();

export function invalidateAccountCache(userId: string) {
  accountCache.delete(userId);
}

export async function getAccountState(userId: string): Promise<AccountState> {
  const cached = accountCache.get(userId);
  if (cached && Date.now() - cached.at < STATUS_TTL_MS) return cached;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { status: true, passwordChangedAt: true } });
  // A deleted account counts as suspended: its token must stop working too.
  const state = { suspended: !user || user.status === "SUSPENDED", passwordStamp: user?.passwordChangedAt?.getTime() ?? 0 };
  accountCache.set(userId, { ...state, at: Date.now() });
  return state;
}

export async function isSuspended(userId: string): Promise<boolean> {
  return (await getAccountState(userId)).suspended;
}

// False for tokens issued before the account's latest password change. A stamp newer
// than the one we have (only this server signs tokens) means our cached read raced the
// change, so it's accepted rather than signing out the user who just changed it.
export function sessionIsCurrent(claims: TokenClaims, state: AccountState) {
  return (claims.pwd ?? 0) >= state.passwordStamp;
}

export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid Authorization header" });
  }
  let claims: TokenClaims;
  try {
    claims = verifyToken(header.slice("Bearer ".length));
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
  try {
    const state = await getAccountState(claims.sub);
    if (state.suspended) {
      return res.status(403).json({ error: "This account has been suspended", code: "ACCOUNT_SUSPENDED" });
    }
    if (!sessionIsCurrent(claims, state)) {
      return res.status(401).json({ error: "Your password was changed. Please sign in again.", code: "SESSION_EXPIRED" });
    }
  } catch (err) {
    return next(err);
  }
  req.userId = claims.sub;
  next();
}

export async function optionalAuth(req: AuthedRequest, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    try {
      const claims = verifyToken(header.slice("Bearer ".length));
      // Suspended accounts and sessions from before a password change browse as guests.
      const state = await getAccountState(claims.sub);
      if (!state.suspended && sessionIsCurrent(claims, state)) req.userId = claims.sub;
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
