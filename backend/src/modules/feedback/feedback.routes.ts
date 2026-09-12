import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { upload } from "../../middleware/upload";
import { asyncHandler } from "../../utils/asyncHandler";
import * as controller from "./feedback.controller";

export const feedbackRouter = Router();
feedbackRouter.use(requireAuth);
feedbackRouter.post("/", upload.single("screenshot"), asyncHandler(controller.create));
