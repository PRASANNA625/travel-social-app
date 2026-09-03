import { Router } from "express";
import { optionalAuth, requireAuth } from "../../middleware/auth";
import { upload } from "../../middleware/upload";
import { asyncHandler } from "../../utils/asyncHandler";
import * as controller from "./trips.controller";

export const tripsRouter = Router();

// Discovery is public but personalized (like/bookmark flags) when a token is present.
tripsRouter.get("/", optionalAuth, asyncHandler(controller.list));
tripsRouter.get("/mine", requireAuth, asyncHandler(controller.mine));
tripsRouter.get("/bookmarked", requireAuth, asyncHandler(controller.bookmarked));
tripsRouter.post("/images", requireAuth, upload.array("images", 8), asyncHandler(controller.uploadImages));
tripsRouter.get("/:id", optionalAuth, asyncHandler(controller.getById));
tripsRouter.get("/:id/comments", asyncHandler(controller.listComments));

tripsRouter.post("/", requireAuth, asyncHandler(controller.create));
tripsRouter.patch("/:id", requireAuth, asyncHandler(controller.update));
tripsRouter.post("/:id/cancel", requireAuth, asyncHandler(controller.cancel));
tripsRouter.delete("/:id", requireAuth, asyncHandler(controller.remove));
tripsRouter.post("/:id/like", requireAuth, asyncHandler(controller.like));
tripsRouter.delete("/:id/like", requireAuth, asyncHandler(controller.unlike));
tripsRouter.post("/:id/bookmark", requireAuth, asyncHandler(controller.bookmark));
tripsRouter.delete("/:id/bookmark", requireAuth, asyncHandler(controller.unbookmark));
tripsRouter.post("/:id/comments", requireAuth, asyncHandler(controller.addComment));
