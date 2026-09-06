import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import * as controller from "./assistant.controller";

export const assistantRouter = Router();

assistantRouter.use(requireAuth);
assistantRouter.post("/messages", asyncHandler(controller.sendMessage));
