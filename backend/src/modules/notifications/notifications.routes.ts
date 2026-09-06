import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import * as controller from "./notifications.controller";

export const notificationsRouter = Router();

notificationsRouter.use(requireAuth);
notificationsRouter.get("/", asyncHandler(controller.list));
notificationsRouter.post("/:id/read", asyncHandler(controller.markRead));
notificationsRouter.post("/read-all", asyncHandler(controller.markAllRead));
notificationsRouter.post("/groups/:groupId/read", asyncHandler(controller.markGroupRead));
