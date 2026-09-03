import type { Response } from "express";
import { z } from "zod";
import type { AuthedRequest } from "../../middleware/auth";
import { fileUrl } from "../../middleware/upload";
import { HttpError } from "../../middleware/error";
import { travelModes } from "../trips/trips.types";
import * as service from "./users.service";

export async function me(req: AuthedRequest, res: Response) {
  const user = await service.getUserById(req.userId!);
  res.json(user);
}

export async function getById(req: AuthedRequest, res: Response) {
  const user = await service.getUserById(req.params.id);
  res.json(user);
}

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  age: z.number().int().min(13).max(120).nullable().optional(),
  location: z.string().nullable().optional(),
  bio: z.string().max(1000).nullable().optional(),
  interests: z.array(z.string()).optional(),
  preferredModes: z.array(z.enum(travelModes)).optional(),
});

export async function updateMe(req: AuthedRequest, res: Response) {
  const data = updateSchema.parse(req.body);
  const user = await service.updateProfile(req.userId!, data);
  res.json(user);
}

export async function uploadPhoto(req: AuthedRequest, res: Response) {
  if (!req.file) throw new HttpError(400, "No file uploaded");
  const user = await service.setPhoto(req.userId!, fileUrl(req.file.filename));
  res.json(user);
}

export async function completedTrips(req: AuthedRequest, res: Response) {
  const trips = await service.getCompletedTrips(req.params.id);
  res.json(trips);
}
