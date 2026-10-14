import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import * as controller from "./joinRequests.controller";

export const joinRequestsRouter = Router();

joinRequestsRouter.use(requireAuth);

joinRequestsRouter.get("/mine", asyncHandler(controller.mine));
joinRequestsRouter.get("/invitations", asyncHandler(controller.invitations));
joinRequestsRouter.get("/trips/:tripId/invitable", asyncHandler(controller.invitable));
joinRequestsRouter.post("/:id/accept", asyncHandler(controller.acceptInvitation));
joinRequestsRouter.post("/:id/decline", asyncHandler(controller.declineInvitation));
joinRequestsRouter.post("/trips/:tripId", asyncHandler(controller.create));
joinRequestsRouter.get("/trips/:tripId", asyncHandler(controller.listForTrip));
joinRequestsRouter.get("/trips/:tripId/mine", asyncHandler(controller.mineForTrip));
joinRequestsRouter.post("/trips/:tripId/invite", asyncHandler(controller.invite));
joinRequestsRouter.post("/:id/approve", asyncHandler(controller.approve));
joinRequestsRouter.post("/:id/reject", asyncHandler(controller.reject));
