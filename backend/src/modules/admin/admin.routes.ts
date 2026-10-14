import { Router, type Response } from "express";
import { z } from "zod";
import { AccountStatus, BuddyConnectionStatus, FeedbackKind, FeedbackStatus, ReportReason, ReportStatus, TravelMode, TripStatus, UserRole } from "@prisma/client";
import { requireAuth, requireRole, type AuthedRequest } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import { prisma } from "../../config/prisma";
import * as users from "./admin.users";
import * as trips from "./admin.trips";
import * as moderation from "./admin.moderation";
import * as insights from "./admin.insights";
import { getSettings, settingsSchema, updateSettings } from "./settings";
import { logAction } from "./audit";
import { heroAdminRouter } from "../hero/hero.routes";

// Every /admin endpoint requires a signed-in, non-suspended account with at least
// the role named on the route. Roles are checked against the database each time.
//
//   MODERATOR   - read everything, handle reports/feedback, hide trips, remove
//                 reviews/comments, suspend regular users
//   ADMIN       - + edit users and trips, manage participants, announcements,
//                 settings, exports and the audit log
//   SUPER_ADMIN - + assign roles
export const adminRouter = Router();
adminRouter.use(requireAuth);

const MOD = requireRole("MODERATOR");
const ADMIN = requireRole("ADMIN");
const SUPER = requireRole("SUPER_ADMIN");

const page = {
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
};
const boolParam = z.enum(["true", "false"]).transform((v) => v === "true").optional();
const reason = z.string().trim().min(3, "Please give a reason").max(500);

function actor(req: AuthedRequest) {
  return { id: req.userId!, role: req.userRole! };
}

// --- Discover hero banners (own module; roles checked per route) -------------------

adminRouter.use("/hero", heroAdminRouter);

// --- Session ----------------------------------------------------------------------

adminRouter.get(
  "/me",
  MOD,
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const me = await prisma.user.findUniqueOrThrow({
      where: { id: req.userId },
      select: { id: true, name: true, email: true, photoUrl: true, role: true },
    });
    res.json(me);
  })
);

adminRouter.get("/alerts", MOD, asyncHandler(async (_req, res) => res.json(await insights.getAlerts())));

// --- Overview & analytics ------------------------------------------------------------

adminRouter.get("/overview", MOD, asyncHandler(async (_req, res) => res.json(await insights.getOverview())));

adminRouter.get(
  "/analytics",
  MOD,
  asyncHandler(async (req, res) => {
    const { days } = z.object({ days: z.coerce.number().int().min(7).max(365).default(30) }).parse(req.query);
    res.json(await insights.getAnalytics(days));
  })
);

adminRouter.get(
  "/export/:type",
  ADMIN,
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const type = z.enum(["users", "trips", "destinations"]).parse(req.params.type);
    const body = await insights.exportReport(req.userId!, type);
    const date = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="triply-${type}-${date}.csv"`);
    res.send(body);
  })
);

// --- Users ------------------------------------------------------------------------

adminRouter.get(
  "/users",
  MOD,
  asyncHandler(async (req, res) => {
    const filters = z
      .object({
        ...page,
        search: z.string().trim().max(100).optional(),
        role: z.nativeEnum(UserRole).optional(),
        status: z.nativeEnum(AccountStatus).optional(),
      })
      .parse(req.query);
    res.json(await users.listUsers(filters));
  })
);

adminRouter.get("/users/:id", MOD, asyncHandler(async (req, res) => res.json(await users.getUserDetail(req.params.id))));

adminRouter.patch(
  "/users/:id",
  ADMIN,
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const data = z
      .object({
        name: z.string().trim().min(1).max(80).optional(),
        location: z.string().trim().max(120).nullable().optional(),
        bio: z.string().trim().max(500).nullable().optional(),
      })
      .strict()
      .parse(req.body);
    const { id, role } = actor(req);
    res.json(await users.updateUser(id, role, req.params.id, data));
  })
);

adminRouter.post(
  "/users/:id/suspend",
  MOD,
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const body = z.object({ reason }).parse(req.body);
    const { id, role } = actor(req);
    res.json(await users.suspendUser(id, role, req.params.id, body.reason));
  })
);

adminRouter.post(
  "/users/:id/activate",
  MOD,
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const { id, role } = actor(req);
    res.json(await users.activateUser(id, role, req.params.id));
  })
);

adminRouter.post(
  "/users/bulk",
  MOD,
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const body = z
      .object({ ids: z.array(z.string()).min(1).max(100), action: z.enum(["suspend", "activate"]), reason: reason.optional() })
      .parse(req.body);
    const { id, role } = actor(req);
    res.json(await users.bulkSetStatus(id, role, body.ids, body.action, body.reason));
  })
);

adminRouter.patch(
  "/users/:id/role",
  SUPER,
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const { role } = z.object({ role: z.nativeEnum(UserRole) }).parse(req.body);
    res.json(await users.setUserRole(req.userId!, req.params.id, role));
  })
);

adminRouter.get("/staff", MOD, asyncHandler(async (_req, res) => res.json(await users.listStaff())));

// --- Trips & events --------------------------------------------------------------------

adminRouter.get(
  "/trips",
  MOD,
  asyncHandler(async (req, res) => {
    const filters = z
      .object({
        ...page,
        search: z.string().trim().max(100).optional(),
        status: z.nativeEnum(TripStatus).optional(),
        travelMode: z.nativeEnum(TravelMode).optional(),
        featured: boolParam,
        hidden: boolParam,
        upcoming: boolParam,
      })
      .parse(req.query);
    res.json(await trips.listTrips(filters));
  })
);

adminRouter.get("/trips/:id", MOD, asyncHandler(async (req, res) => res.json(await trips.getTripDetail(req.params.id))));

// Moderators may only hide/unhide; every other change needs an admin.
adminRouter.patch(
  "/trips/:id",
  MOD,
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const data = z
      .object({
        title: z.string().trim().min(1).max(120).optional(),
        destination: z.string().trim().min(1).max(120).optional(),
        startDate: z.coerce.date().optional(),
        endDate: z.coerce.date().optional(),
        travelMode: z.nativeEnum(TravelMode).optional(),
        status: z.nativeEnum(TripStatus).optional(),
        featured: z.boolean().optional(),
        hidden: z.boolean().optional(),
      })
      .strict()
      .parse(req.body);
    const onlyVisibility = Object.keys(data).every((k) => k === "hidden");
    if (!onlyVisibility && req.userRole === "MODERATOR") {
      return res.status(403).json({ error: "Moderators can only hide or unhide trips", code: "FORBIDDEN" });
    }
    res.json(await trips.updateTrip(req.userId!, req.params.id, data));
  })
);

adminRouter.post(
  "/trips/bulk",
  MOD,
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const body = z
      .object({
        ids: z.array(z.string()).min(1).max(100),
        action: z.enum(["feature", "unfeature", "hide", "unhide", "cancel", "close"]),
      })
      .parse(req.body);
    if (req.userRole === "MODERATOR" && body.action !== "hide" && body.action !== "unhide") {
      return res.status(403).json({ error: "Moderators can only hide or unhide trips", code: "FORBIDDEN" });
    }
    res.json(await trips.bulkUpdateTrips(req.userId!, body.ids, body.action));
  })
);

adminRouter.delete(
  "/trips/:id",
  ADMIN,
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const body = z.object({ reason }).parse(req.body);
    await trips.deleteTrip(req.userId!, req.params.id, body.reason);
    res.status(204).end();
  })
);

adminRouter.post(
  "/join-requests/:id/decision",
  ADMIN,
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const { approve } = z.object({ approve: z.boolean() }).parse(req.body);
    res.json(await trips.decideJoinRequest(req.userId!, req.params.id, approve));
  })
);

adminRouter.delete(
  "/trips/:id/participants/:userId",
  ADMIN,
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const body = z.object({ reason }).parse(req.body);
    await trips.removeParticipant(req.userId!, req.params.id, req.params.userId, body.reason);
    res.status(204).end();
  })
);

// --- Reports & moderation -------------------------------------------------------------

adminRouter.get(
  "/reports",
  MOD,
  asyncHandler(async (req, res) => {
    const filters = z
      .object({ ...page, status: z.nativeEnum(ReportStatus).optional(), reason: z.nativeEnum(ReportReason).optional() })
      .parse(req.query);
    res.json(await moderation.listReports(filters));
  })
);

adminRouter.patch(
  "/reports/:id",
  MOD,
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const body = z
      .object({
        status: z.nativeEnum(ReportStatus),
        note: z.string().trim().max(500).optional(),
        suspendReported: z.boolean().optional(),
      })
      .parse(req.body);
    const { id, role } = actor(req);
    res.json(await moderation.resolveReport(id, role, req.params.id, body));
  })
);

adminRouter.post(
  "/messages/:id/remove",
  MOD,
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const { reason } = z.object({ reason: z.string().trim().min(3).max(500) }).parse(req.body);
    res.json(await moderation.removeMessage(actor(req).id, req.params.id, reason));
  })
);

adminRouter.get(
  "/connections",
  MOD,
  asyncHandler(async (req, res) => {
    const filters = z
      .object({ ...page, status: z.nativeEnum(BuddyConnectionStatus).optional(), search: z.string().trim().max(100).optional() })
      .parse(req.query);
    res.json(await moderation.listConnections(filters));
  })
);

adminRouter.delete(
  "/connections/:id",
  ADMIN,
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    await moderation.deleteConnection(req.userId!, req.params.id);
    res.status(204).end();
  })
);

adminRouter.get("/flagged-accounts", MOD, asyncHandler(async (_req, res) => res.json(await moderation.listFlaggedAccounts())));

adminRouter.get(
  "/reviews",
  MOD,
  asyncHandler(async (req, res) => {
    const filters = z
      .object({ ...page, search: z.string().trim().max(100).optional(), maxRating: z.coerce.number().int().min(1).max(5).optional() })
      .parse(req.query);
    res.json(await moderation.listReviews(filters));
  })
);

adminRouter.delete(
  "/reviews/:tripId/:userId",
  MOD,
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const body = z.object({ reason }).parse(req.body);
    await moderation.deleteReview(req.userId!, req.params.tripId, req.params.userId, body.reason);
    res.status(204).end();
  })
);

adminRouter.get(
  "/comments",
  MOD,
  asyncHandler(async (req, res) => {
    const filters = z.object({ ...page, search: z.string().trim().max(100).optional() }).parse(req.query);
    res.json(await moderation.listComments(filters));
  })
);

adminRouter.delete(
  "/comments/:id",
  MOD,
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const body = z.object({ reason }).parse(req.body);
    await moderation.deleteComment(req.userId!, req.params.id, body.reason);
    res.status(204).end();
  })
);

adminRouter.get(
  "/feedback",
  MOD,
  asyncHandler(async (req, res) => {
    const filters = z
      .object({ ...page, status: z.nativeEnum(FeedbackStatus).optional(), kind: z.nativeEnum(FeedbackKind).optional() })
      .parse(req.query);
    res.json(await moderation.listFeedback(filters));
  })
);

adminRouter.patch(
  "/feedback/:id",
  MOD,
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const { status } = z.object({ status: z.nativeEnum(FeedbackStatus) }).parse(req.body);
    res.json(await moderation.setFeedbackStatus(req.userId!, req.params.id, status));
  })
);

// --- Notifications ------------------------------------------------------------------------

const audience = z.enum(["ALL", "ACTIVE_30D", "ORGANIZERS", "STAFF"]);

adminRouter.get(
  "/announcements",
  MOD,
  asyncHandler(async (req, res) => res.json(await insights.listAnnouncements(z.object(page).parse(req.query))))
);

adminRouter.get(
  "/announcements/audience-size",
  MOD,
  asyncHandler(async (req, res) => {
    const { audience: a } = z.object({ audience }).parse(req.query);
    res.json({ count: await insights.audienceSize(a) });
  })
);

adminRouter.post(
  "/announcements",
  ADMIN,
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const body = z
      .object({ title: z.string().trim().min(3).max(80), body: z.string().trim().min(3).max(500), audience })
      .parse(req.body);
    res.status(201).json(await insights.sendAnnouncement(req.userId!, body));
  })
);

adminRouter.get("/notification-stats", MOD, asyncHandler(async (_req, res) => res.json(await insights.notificationStats())));

// --- Configuration ------------------------------------------------------------------------

adminRouter.get("/settings", MOD, asyncHandler(async (_req, res) => res.json(await getSettings())));

adminRouter.put(
  "/settings",
  ADMIN,
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const input = settingsSchema.parse(req.body);
    const before = await getSettings();
    const saved = await updateSettings(input, req.userId!);
    const changed = (Object.keys(input) as (keyof typeof input)[]).filter(
      (k) => JSON.stringify(before[k]) !== JSON.stringify(input[k])
    );
    await logAction(req.userId!, "settings.update", "SETTINGS", null, { changed });
    res.json(saved);
  })
);

// --- Audit log ------------------------------------------------------------------------------

adminRouter.get(
  "/audit",
  ADMIN,
  asyncHandler(async (req, res) => {
    const filters = z
      .object({
        ...page,
        action: z.string().trim().max(60).optional(),
        actorId: z.string().optional(),
        targetType: z.string().trim().max(30).optional(),
      })
      .parse(req.query);
    res.json(await insights.listAudit(filters));
  })
);
