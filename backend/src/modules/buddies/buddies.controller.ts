import type { Response } from "express";
import type { AuthedRequest } from "../../middleware/auth";
import * as service from "./buddies.service";
import { buddyFiltersSchema } from "./buddies.types";

export async function matches(req: AuthedRequest, res: Response) {
  const filters = buddyFiltersSchema.parse(req.query);
  const result = await service.getBuddyMatches(req.userId!, filters);
  res.json(result);
}

export async function connect(req: AuthedRequest, res: Response) {
  const request = await service.sendBuddyRequest(req.userId!, req.params.userId);
  res.status(201).json(request);
}

export async function accept(req: AuthedRequest, res: Response) {
  const request = await service.respondToBuddyRequest(req.params.id, req.userId!, true);
  res.json(request);
}

export async function reject(req: AuthedRequest, res: Response) {
  const request = await service.respondToBuddyRequest(req.params.id, req.userId!, false);
  res.json(request);
}

export async function pending(req: AuthedRequest, res: Response) {
  const requests = await service.myPendingBuddyRequests(req.userId!);
  res.json(requests);
}
