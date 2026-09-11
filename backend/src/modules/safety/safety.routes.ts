import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import * as controller from "./safety.controller";

export const safetyRouter = Router();
safetyRouter.use(requireAuth);

safetyRouter.get("/blocked", asyncHandler(controller.blockedList));
safetyRouter.post("/users/:id/report", asyncHandler(controller.report));
safetyRouter.post("/users/:id/block", asyncHandler(controller.block));
safetyRouter.delete("/users/:id/block", asyncHandler(controller.unblock));
