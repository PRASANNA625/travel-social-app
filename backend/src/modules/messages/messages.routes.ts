import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { upload } from "../../middleware/upload";
import { asyncHandler } from "../../utils/asyncHandler";
import * as controller from "./messages.controller";

export const messagesRouter = Router();

messagesRouter.use(requireAuth);
messagesRouter.get("/groups/:groupId", asyncHandler(controller.list));
messagesRouter.post("/images", upload.single("image"), asyncHandler(controller.uploadImage));
