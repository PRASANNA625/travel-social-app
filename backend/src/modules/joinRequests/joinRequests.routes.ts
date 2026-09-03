import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import * as controller from "./joinRequests.controller";

export const joinRequestsRouter = Router();

joinRequestsRouter.use(requireAuth);

joinRequestsRouter.get("/mine", asyncHandler(controller.mine));
joinRequestsRouter.post("/trips/:tripId", asyncHandler(controller.create));
joinRequestsRouter.get("/trips/:tripId", asyncHandler(controller.listForTrip));
joinRequestsRouter.post("/trips/:tripId/invite", asyncHandler(controller.invite));
joinRequestsRouter.post("/:id/approve", asyncHandler(controller.approve));
joinRequestsRouter.post("/:id/reject", asyncHandler(controller.reject));
