import type { Response } from "express";
import type { AuthedRequest } from "../../middleware/auth";
import * as service from "./groups.service";

export async function getByTrip(req: AuthedRequest, res: Response) {
  const group = await service.getGroupForTrip(req.params.tripId, req.userId!);
  res.json(group);
}

export async function getById(req: AuthedRequest, res: Response) {
  const group = await service.getGroupById(req.params.id, req.userId!);
  res.json(group);
}
