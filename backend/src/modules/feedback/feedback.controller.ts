import type { Response } from "express";
import type { AuthedRequest } from "../../middleware/auth";
import { uploadToCloudinary } from "../../middleware/upload";
import * as service from "./feedback.service";
import { createFeedbackSchema } from "./feedback.types";

export async function create(req: AuthedRequest, res: Response) {
  const input = createFeedbackSchema.parse(req.body);
  const screenshotUrl = req.file ? await uploadToCloudinary(req.file) : null;
  const result = await service.createFeedback(req.userId!, input, screenshotUrl);
  res.status(201).json(result);
}
