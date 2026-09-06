import type { Response } from "express";
import type { AuthedRequest } from "../../middleware/auth";
import * as service from "./notifications.service";

export async function list(req: AuthedRequest, res: Response) {
  const result = await service.listNotifications(req.userId!, req.query as Record<string, unknown>);
  res.json(result);
}

export async function markRead(req: AuthedRequest, res: Response) {
  await service.markNotificationRead(req.userId!, req.params.id);
  res.json({ ok: true });
}

export async function markAllRead(req: AuthedRequest, res: Response) {
  await service.markAllNotificationsRead(req.userId!);
  res.json({ ok: true });
}

export async function markGroupRead(req: AuthedRequest, res: Response) {
  await service.markGroupNotificationsRead(req.userId!, req.params.groupId);
  res.json({ ok: true });
}
