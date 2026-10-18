import type { Request, Response } from "express";
import { z } from "zod";
import * as service from "./auth.service";
import * as password from "./password.service";
import type { AuthedRequest } from "../../middleware/auth";

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
});

export async function register(req: Request, res: Response) {
  const { email, password, name } = registerSchema.parse(req.body);
  const result = await service.register(email, password, name);
  res.status(201).json(result);
}

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function login(req: Request, res: Response) {
  const { email, password } = loginSchema.parse(req.body);
  const result = await service.login(email, password);
  res.json(result);
}

const googleSchema = z.object({ idToken: z.string().min(1) });

export async function google(req: Request, res: Response) {
  const { idToken } = googleSchema.parse(req.body);
  const result = await service.loginWithGoogle(idToken);
  res.json(result);
}

const sendOtpSchema = z.object({ phone: z.string().min(6) });

export async function sendOtp(req: Request, res: Response) {
  const { phone } = sendOtpSchema.parse(req.body);
  const result = await service.sendPhoneOtp(phone);
  res.json({ ok: true, ...result });
}

const verifyOtpSchema = z.object({
  phone: z.string().min(6),
  code: z.string().min(4),
  name: z.string().min(1).optional(),
});

export async function verifyOtp(req: Request, res: Response) {
  const { phone, code, name } = verifyOtpSchema.parse(req.body);
  const result = await service.verifyPhoneOtp(phone, code, name);
  res.json(result);
}

const passwordField = z.string().min(8, "Use at least 8 characters").max(128);

export async function forgotPassword(req: Request, res: Response) {
  const { email } = z.object({ email: z.string().trim().email() }).parse(req.body);
  await password.requestPasswordReset(email, req.ip);
  res.json({ ok: true });
}

export async function resetPassword(req: Request, res: Response) {
  const body = z.object({ token: z.string().min(20).max(200), password: passwordField }).parse(req.body);
  const user = await password.resetPassword(body.token, body.password);
  res.json(service.toAuthResponse(user));
}

export async function changePassword(req: AuthedRequest, res: Response) {
  const body = z.object({ currentPassword: z.string().max(128).optional(), newPassword: passwordField }).parse(req.body);
  res.json(await password.changePassword(req.userId!, body.currentPassword, body.newPassword));
}
