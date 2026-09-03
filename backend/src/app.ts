import express from "express";
import cors from "cors";
import path from "path";
import { env } from "./config/env";
import { errorHandler, notFoundHandler } from "./middleware/error";
import { authRouter } from "./modules/auth/auth.routes";
import { usersRouter } from "./modules/users/users.routes";
import { tripsRouter } from "./modules/trips/trips.routes";
import { joinRequestsRouter } from "./modules/joinRequests/joinRequests.routes";
import { groupsRouter } from "./modules/groups/groups.routes";
import { messagesRouter } from "./modules/messages/messages.routes";
import { notificationsRouter } from "./modules/notifications/notifications.routes";

export const app = express();

app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(path.resolve(env.uploadsDir)));

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/auth", authRouter);
app.use("/users", usersRouter);
app.use("/trips", tripsRouter);
app.use("/join-requests", joinRequestsRouter);
app.use("/groups", groupsRouter);
app.use("/messages", messagesRouter);
app.use("/notifications", notificationsRouter);

app.use(notFoundHandler);
app.use(errorHandler);
