import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import * as controller from "./groups.controller";

export const groupsRouter = Router();

groupsRouter.use(requireAuth);
groupsRouter.get("/mine", asyncHandler(controller.listMine));
groupsRouter.get("/by-trip/:tripId", asyncHandler(controller.getByTrip));
groupsRouter.get("/:id", asyncHandler(controller.getById));
