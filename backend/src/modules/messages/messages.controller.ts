import type { Response } from "express";
import type { AuthedRequest } from "../../middleware/auth";
import { uploadToCloudinary } from "../../middleware/upload";
import { HttpError } from "../../middleware/error";
import * as service from "./messages.service";

export async function list(req: AuthedRequest, res: Response) {
  const result = await service.listMessages(req.params.groupId, req.userId!, req.query as Record<string, unknown>);
  res.json(result);
}

export async function uploadImage(req: AuthedRequest, res: Response) {
  if (!req.file) throw new HttpError(400, "No file uploaded");
  const url = await uploadToCloudinary(req.file);
  res.json({ url });
}
