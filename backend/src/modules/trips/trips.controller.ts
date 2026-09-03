import type { Response } from "express";
import { z } from "zod";
import type { AuthedRequest } from "../../middleware/auth";
import { fileUrl } from "../../middleware/upload";
import { HttpError } from "../../middleware/error";
import * as service from "./trips.service";
import { createTripSchema, tripFiltersSchema, updateTripSchema } from "./trips.types";

export async function create(req: AuthedRequest, res: Response) {
  const input = createTripSchema.parse(req.body);
  const trip = await service.createTrip(req.userId!, input);
  res.status(201).json(trip);
}

export async function list(req: AuthedRequest, res: Response) {
  const filters = tripFiltersSchema.parse(req.query);
  const result = await service.listTrips(filters, req.userId);
  res.json(result);
}

export async function getById(req: AuthedRequest, res: Response) {
  const trip = await service.getTripById(req.params.id, req.userId);
  res.json(trip);
}

export async function mine(req: AuthedRequest, res: Response) {
  const trips = await service.getMyTrips(req.userId!);
  res.json(trips);
}

export async function bookmarked(req: AuthedRequest, res: Response) {
  const trips = await service.getBookmarkedTrips(req.userId!);
  res.json(trips);
}

export async function update(req: AuthedRequest, res: Response) {
  const input = updateTripSchema.parse(req.body);
  const trip = await service.updateTrip(req.params.id, req.userId!, input);
  res.json(trip);
}

export async function cancel(req: AuthedRequest, res: Response) {
  const trip = await service.cancelTrip(req.params.id, req.userId!);
  res.json(trip);
}

export async function remove(req: AuthedRequest, res: Response) {
  await service.deleteTrip(req.params.id, req.userId!);
  res.json({ ok: true });
}

export async function like(req: AuthedRequest, res: Response) {
  await service.likeTrip(req.params.id, req.userId!);
  res.json({ ok: true });
}

export async function unlike(req: AuthedRequest, res: Response) {
  await service.unlikeTrip(req.params.id, req.userId!);
  res.json({ ok: true });
}

export async function bookmark(req: AuthedRequest, res: Response) {
  await service.bookmarkTrip(req.params.id, req.userId!);
  res.json({ ok: true });
}

export async function unbookmark(req: AuthedRequest, res: Response) {
  await service.unbookmarkTrip(req.params.id, req.userId!);
  res.json({ ok: true });
}

const commentSchema = z.object({ text: z.string().min(1).max(2000) });

export async function addComment(req: AuthedRequest, res: Response) {
  const { text } = commentSchema.parse(req.body);
  const comment = await service.addComment(req.params.id, req.userId!, text);
  res.status(201).json(comment);
}

export async function listComments(req: AuthedRequest, res: Response) {
  const comments = await service.listComments(req.params.id);
  res.json(comments);
}

export async function uploadImages(req: AuthedRequest, res: Response) {
  const files = req.files as Express.Multer.File[] | undefined;
  if (!files?.length) throw new HttpError(400, "No files uploaded");
  res.json({ urls: files.map((f) => fileUrl(f.filename)) });
}
