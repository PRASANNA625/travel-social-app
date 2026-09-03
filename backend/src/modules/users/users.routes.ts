import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { upload } from "../../middleware/upload";
import { asyncHandler } from "../../utils/asyncHandler";
import * as controller from "./users.controller";

export const usersRouter = Router();

usersRouter.use(requireAuth);
usersRouter.get("/me", asyncHandler(controller.me));
usersRouter.patch("/me", asyncHandler(controller.updateMe));
usersRouter.post("/me/photo", upload.single("photo"), asyncHandler(controller.uploadPhoto));
usersRouter.get("/:id", asyncHandler(controller.getById));
usersRouter.get("/:id/completed-trips", asyncHandler(controller.completedTrips));
