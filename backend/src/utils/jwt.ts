import jwt from "jsonwebtoken";
import { env } from "../config/env";

// `pwd` is the account's passwordChangedAt in ms (0 if never changed). A token whose
// pwd doesn't match the account any more was issued before a password change.
export interface TokenClaims {
  sub: string;
  pwd?: number;
}

export function signToken(userId: string, passwordChangedAt?: Date | null): string {
  return jwt.sign({ sub: userId, pwd: passwordChangedAt?.getTime() ?? 0 }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  } as jwt.SignOptions);
}

export function verifyToken(token: string): TokenClaims {
  return jwt.verify(token, env.jwtSecret) as TokenClaims;
}
