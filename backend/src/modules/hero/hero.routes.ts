import { Router, type Response } from "express";
import { z } from "zod";
import { requireRole, type AuthedRequest } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import { logAction } from "../admin/audit";
import { heroUpload, storeHeroMedia } from "./hero.media";
import * as hero from "./hero.service";

// Public: the banners Discover shows right now.
export const heroPublicRouter = Router();
heroPublicRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    // Short cache so publishing shows up within a minute without hammering the API.
    res.setHeader("Cache-Control", "public, max-age=30");
    res.json(await hero.listLiveBanners());
  })
);

// Admin (mounted under /admin, which already requires sign-in). Moderators can
// look; only admins can upload, edit, publish or delete.
export const heroAdminRouter = Router();
const MOD = requireRole("MODERATOR");
const ADMIN = requireRole("ADMIN");

heroAdminRouter.get("/", MOD, asyncHandler(async (_req, res) => res.json(await hero.listAllBanners())));

heroAdminRouter.post(
  "/media",
  ADMIN,
  heroUpload,
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const kind = z.enum(["media", "poster"]).default("media").parse(req.query.kind);
    const stored = await storeHeroMedia(req.file, kind === "poster" ? "IMAGE" : undefined);
    await logAction(req.userId!, "hero.upload", "HERO_BANNER", null, { mediaType: stored.mediaType, bytes: stored.bytes, kind });
    res.status(201).json(stored);
  })
);

heroAdminRouter.post(
  "/",
  ADMIN,
  asyncHandler(async (req: AuthedRequest, res: Response) => res.status(201).json(await hero.createBanner(req.body, req.userId!)))
);

heroAdminRouter.put(
  "/settings",
  ADMIN,
  asyncHandler(async (req: AuthedRequest, res: Response) => res.json(await hero.updateHeroSettings(req.body, req.userId!)))
);

heroAdminRouter.post(
  "/reorder",
  ADMIN,
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const { ids } = z.object({ ids: z.array(z.string().min(1)).min(1).max(100) }).parse(req.body);
    await hero.reorderBanners(ids, req.userId!);
    res.json({ ok: true });
  })
);

heroAdminRouter.patch(
  "/:id",
  ADMIN,
  asyncHandler(async (req: AuthedRequest, res: Response) => res.json(await hero.updateBanner(req.params.id, req.body, req.userId!)))
);

heroAdminRouter.delete(
  "/:id",
  ADMIN,
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    await hero.deleteBanner(req.params.id, req.userId!);
    res.status(204).end();
  })
);
