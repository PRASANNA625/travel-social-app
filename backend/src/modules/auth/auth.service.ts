import bcrypt from "bcryptjs";
import { OAuth2Client } from "google-auth-library";
import { prisma } from "../../config/prisma";
import { env } from "../../config/env";
import { signToken } from "../../utils/jwt";
import { HttpError } from "../../middleware/error";
import { phoneProvider } from "./phoneProvider";

const googleClient = new OAuth2Client(env.googleClientId);

function toAuthResponse(user: { id: string }) {
  return { token: signToken(user.id) };
}

export async function register(email: string, password: string, name: string) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new HttpError(409, "An account with this email already exists");

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({ data: { email, passwordHash, name } });
  return { ...toAuthResponse(user), user };
}

export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user?.passwordHash) throw new HttpError(401, "Invalid email or password");

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new HttpError(401, "Invalid email or password");

  return { ...toAuthResponse(user), user };
}

export async function loginWithGoogle(idToken: string) {
  if (!env.googleClientId) throw new HttpError(500, "Google sign-in is not configured on this server");

  const ticket = await googleClient.verifyIdToken({ idToken, audience: env.googleClientId });
  const payload = ticket.getPayload();
  if (!payload?.sub || !payload.email) throw new HttpError(401, "Invalid Google token");

  let user = await prisma.user.findFirst({
    where: { OR: [{ googleId: payload.sub }, { email: payload.email }] },
  });

  if (!user) {
    user = await prisma.user.create({
      data: {
        googleId: payload.sub,
        email: payload.email,
        name: payload.name ?? payload.email.split("@")[0],
        photoUrl: payload.picture,
      },
    });
  } else if (!user.googleId) {
    user = await prisma.user.update({ where: { id: user.id }, data: { googleId: payload.sub } });
  }

  return { ...toAuthResponse(user), user };
}

export async function sendPhoneOtp(phone: string) {
  await phoneProvider.sendOtp(phone);
}

export async function verifyPhoneOtp(phone: string, code: string, name?: string) {
  const isValid = await phoneProvider.verifyOtp(phone, code);
  if (!isValid) throw new HttpError(401, "Invalid or expired code");

  let user = await prisma.user.findUnique({ where: { phone } });
  if (!user) {
    if (!name) throw new HttpError(400, "Name is required to create an account");
    user = await prisma.user.create({ data: { phone, phoneVerified: true, name } });
  } else if (!user.phoneVerified) {
    user = await prisma.user.update({ where: { id: user.id }, data: { phoneVerified: true } });
  }

  return { ...toAuthResponse(user), user };
}
