import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import { requireFeature } from "../admin/settings";
import * as controller from "./assistant.controller";

export const assistantRouter = Router();

assistantRouter.use(requireAuth);
assistantRouter.use(requireFeature("aiAssistant"));
assistantRouter.post("/messages", asyncHandler(controller.sendMessage));
