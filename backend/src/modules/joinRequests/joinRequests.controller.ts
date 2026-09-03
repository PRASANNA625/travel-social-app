import type { Response } from "express";
import { z } from "zod";
import type { AuthedRequest } from "../../middleware/auth";
import * as service from "./joinRequests.service";

const createSchema = z.object({ message: z.string().max(1000).optional() });

export async function create(req: AuthedRequest, res: Response) {
  const { message } = createSchema.parse(req.body);
  const request = await service.createJoinRequest(req.params.tripId, req.userId!, message);
  res.status(201).json(request);
}

export async function listForTrip(req: AuthedRequest, res: Response) {
  const requests = await service.listRequestsForTrip(req.params.tripId, req.userId!);
  res.json(requests);
}

export async function approve(req: AuthedRequest, res: Response) {
  const request = await service.respondToRequest(req.params.id, req.userId!, true);
  res.json(request);
}

export async function reject(req: AuthedRequest, res: Response) {
  const request = await service.respondToRequest(req.params.id, req.userId!, false);
  res.json(request);
}

const inviteSchema = z.object({ userId: z.string().min(1) });

export async function invite(req: AuthedRequest, res: Response) {
  const { userId } = inviteSchema.parse(req.body);
  const request = await service.inviteUser(req.params.tripId, req.userId!, userId);
  res.status(201).json(request);
}

export async function mine(req: AuthedRequest, res: Response) {
  const requests = await service.myJoinRequests(req.userId!);
  res.json(requests);
}
