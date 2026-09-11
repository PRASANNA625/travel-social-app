import type { Response } from "express";
import type { AuthedRequest } from "../../middleware/auth";
import * as service from "./safety.service";
import { reportSchema } from "./safety.types";

export async function report(req: AuthedRequest, res: Response) {
  const { reason, details } = reportSchema.parse(req.body);
  const result = await service.reportUser(req.userId!, req.params.id, reason, details);
  res.status(201).json(result);
}

export async function block(req: AuthedRequest, res: Response) {
  await service.blockUser(req.userId!, req.params.id);
  res.json({ ok: true });
}

export async function unblock(req: AuthedRequest, res: Response) {
  await service.unblockUser(req.userId!, req.params.id);
  res.json({ ok: true });
}

export async function blockedList(req: AuthedRequest, res: Response) {
  const users = await service.listBlockedUsers(req.userId!);
  res.json(users);
}
