import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import * as controller from "./buddies.controller";

export const buddiesRouter = Router();
buddiesRouter.use(requireAuth);

buddiesRouter.get("/matches", asyncHandler(controller.matches));
buddiesRouter.get("/requests/pending", asyncHandler(controller.pending));
buddiesRouter.post("/:userId/connect", asyncHandler(controller.connect));
buddiesRouter.post("/requests/:id/accept", asyncHandler(controller.accept));
buddiesRouter.post("/requests/:id/reject", asyncHandler(controller.reject));
