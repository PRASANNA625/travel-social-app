import type { Request, Response } from "express";
import { z } from "zod";
import * as service from "./auth.service";

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
