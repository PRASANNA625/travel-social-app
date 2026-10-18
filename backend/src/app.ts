import express from "express";
import cors from "cors";
import path from "path";
import { env } from "./config/env";
import { errorHandler, notFoundHandler } from "./middleware/error";
import { authRouter } from "./modules/auth/auth.routes";
import { usersRouter } from "./modules/users/users.routes";
import { tripsRouter } from "./modules/trips/trips.routes";
import { joinRequestsRouter } from "./modules/joinRequests/joinRequests.routes";
import { buddiesRouter } from "./modules/buddies/buddies.routes";
import { groupsRouter } from "./modules/groups/groups.routes";
import { messagesRouter } from "./modules/messages/messages.routes";
import { notificationsRouter } from "./modules/notifications/notifications.routes";
import { assistantRouter } from "./modules/assistant/assistant.routes";
import { safetyRouter } from "./modules/safety/safety.routes";
import { feedbackRouter } from "./modules/feedback/feedback.routes";
import { adminRouter } from "./modules/admin/admin.routes";
import { heroPublicRouter } from "./modules/hero/hero.routes";
import { getSettingsCached } from "./modules/admin/settings";
import { asyncHandler } from "./utils/asyncHandler";

export const app = express();

// Render sits behind a proxy; without this every request looks like it comes from
// the proxy's IP, and per-IP rate limits would throttle everyone together.
if (process.env.NODE_ENV === "production") app.set("trust proxy", 1);

app.use(cors());
app.use(express.json());
app.use(
  "/uploads",
  // nosniff: browsers must treat files as the type we stored, never guess (e.g. as HTML).
  express.static(path.resolve(env.uploadsDir), { setHeaders: (res) => res.setHeader("X-Content-Type-Options", "nosniff") })
);

app.get("/health", (_req, res) => res.json({ ok: true }));

// Public app configuration managed from the admin dashboard (feature switches etc.).
app.get(
  "/config",
  asyncHandler(async (_req, res) => {
    res.setHeader("Cache-Control", "public, max-age=30");
    // Only what the apps need; admin-only settings (e.g. templates) stay private.
    const { features, disabledTravelModes, suggestedInterests, announcementBanner } = await getSettingsCached();
    res.json({ features, disabledTravelModes, suggestedInterests, announcementBanner });
  })
);

app.use("/auth", authRouter);
app.use("/users", usersRouter);
app.use("/trips", tripsRouter);
app.use("/join-requests", joinRequestsRouter);
app.use("/buddies", buddiesRouter);
app.use("/groups", groupsRouter);
app.use("/messages", messagesRouter);
app.use("/notifications", notificationsRouter);
app.use("/assistant", assistantRouter);
app.use("/safety", safetyRouter);
app.use("/feedback", feedbackRouter);
app.use("/hero", heroPublicRouter);
app.use("/admin", adminRouter);

app.use(notFoundHandler);
app.use(errorHandler);
