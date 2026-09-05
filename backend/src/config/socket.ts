import type { Server as HttpServer } from "http";
import { Server as SocketIOServer, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { env } from "./env";
import { prisma } from "./prisma";
import { assertMember } from "../modules/groups/groups.service";
import { ALLOWED_REACTIONS, getReactionsForMessage, type AllowedReaction } from "../modules/messages/messages.service";

interface AuthedSocket extends Socket {
  userId?: string;
}

let io: SocketIOServer | undefined;

// Tracks which socket ids belong to each online user, so a user with
// multiple tabs/devices only goes "offline" once their last socket
// closes. In-memory only - resets on server restart, which is an
// accepted trade-off at this app's scale (a single backend instance,
// no Redis anywhere in this stack).
const onlineSockets = new Map<string, Set<string>>();

function isAllowedReaction(value: unknown): value is AllowedReaction {
  return typeof value === "string" && (ALLOWED_REACTIONS as readonly string[]).includes(value);
}

async function groupIdsForUser(userId: string): Promise<string[]> {
  const memberships = await prisma.groupMember.findMany({ where: { userId }, select: { groupId: true } });
  return memberships.map((m) => m.groupId);
}

// Fire-and-forget tail for the "just came online" broadcast. Runs after all
// of this connection's socket.on(...) listeners are registered so a
// disconnect that happens mid-lookup is still caught by the disconnect
// handler (see the race-condition note in the connection handler below).
// Never awaited by its caller, so its own errors are caught here instead of
// becoming an unhandled promise rejection that would crash the process.
async function broadcastOnlinePresence(userId: string): Promise<void> {
  try {
    const groupIds = await groupIdsForUser(userId);
    for (const groupId of groupIds) {
      emitToGroup(groupId, "presence:update", { userId, online: true, lastSeenAt: null });
    }
  } catch (err) {
    console.error("[socket] presence:update (online) broadcast failed", err);
  }
}

export function initSocket(httpServer: HttpServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: { origin: "*" },
  });

  io.use((socket: AuthedSocket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return next(new Error("Missing auth token"));
    try {
      const payload = jwt.verify(token, env.jwtSecret) as { sub: string };
      socket.userId = payload.sub;
      next();
    } catch {
      next(new Error("Invalid auth token"));
    }
  });

  io.on("connection", (socket: AuthedSocket) => {
    if (!socket.userId) return;
    const userId = socket.userId;
    socket.join(`user:${userId}`);

    let sockets = onlineSockets.get(userId);
    const wasOffline = !sockets || sockets.size === 0;
    if (!sockets) {
      sockets = new Set();
      onlineSockets.set(userId, sockets);
    }
    sockets.add(socket.id);

    // All socket.on(...) listeners for this connection (including
    // "disconnect") are registered synchronously below, before any await.
    // This closes a race where an early disconnect (flaky network,
    // immediate tab close) could fire before the disconnect listener
    // existed to catch it, permanently leaving the user marked online.

    socket.on("group:join", async (groupId: string) => {
      const membership = await prisma.groupMember.findUnique({
        where: { groupId_userId: { groupId, userId } },
      });
      if (membership) socket.join(`group:${groupId}`);
    });

    socket.on("group:leave", (groupId: string) => {
      socket.leave(`group:${groupId}`);
    });

    socket.on("message:send", async (data: { groupId: string; type?: "TEXT" | "IMAGE"; content?: string; mediaUrl?: string }) => {
      const membership = await prisma.groupMember.findUnique({
        where: { groupId_userId: { groupId: data.groupId, userId } },
      });
      if (!membership) return;

      const message = await prisma.message.create({
        data: {
          groupId: data.groupId,
          senderId: userId,
          type: data.type ?? "TEXT",
          content: data.content,
          mediaUrl: data.mediaUrl,
        },
        include: { sender: { select: { id: true, name: true, photoUrl: true } } },
      });

      io!.to(`group:${data.groupId}`).emit("message:new", message);
    });

    socket.on("presence:get", async (data: { userIds: string[] }) => {
      try {
        if (!Array.isArray(data?.userIds)) return;
        const requested = data.userIds.slice(0, 200);
        const myGroupIds = await groupIdsForUser(userId);
        const shared = await prisma.groupMember.findMany({
          where: { groupId: { in: myGroupIds }, userId: { in: requested } },
          select: { userId: true },
        });
        const visibleIds = [...new Set(shared.map((m) => m.userId))];
        const users = await prisma.user.findMany({
          where: { id: { in: visibleIds } },
          select: { id: true, lastSeenAt: true },
        });
        const snapshot: Record<string, { online: boolean; lastSeenAt: string | null }> = {};
        for (const user of users) {
          const userSockets = onlineSockets.get(user.id);
          snapshot[user.id] = {
            online: !!userSockets && userSockets.size > 0,
            lastSeenAt: user.lastSeenAt ? user.lastSeenAt.toISOString() : null,
          };
        }
        socket.emit("presence:snapshot", snapshot);
      } catch (err) {
        console.error("[socket] presence:get handler failed", err);
      }
    });

    socket.on("reaction:toggle", async (data: { messageId: string; emoji: string }) => {
      try {
        if (!isAllowedReaction(data.emoji)) return;

        const message = await prisma.message.findUnique({ where: { id: data.messageId }, select: { groupId: true } });
        if (!message) return;
        try {
          await assertMember(message.groupId, userId);
        } catch {
          return;
        }

        const existing = await prisma.messageReaction.findUnique({
          where: { messageId_userId: { messageId: data.messageId, userId } },
        });

        if (existing && existing.emoji === data.emoji) {
          await prisma.messageReaction.delete({
            where: { messageId_userId: { messageId: data.messageId, userId } },
          });
        } else if (existing) {
          await prisma.messageReaction.update({
            where: { messageId_userId: { messageId: data.messageId, userId } },
            data: { emoji: data.emoji },
          });
        } else {
          await prisma.messageReaction.create({
            data: { messageId: data.messageId, userId, emoji: data.emoji },
          });
        }

        const reactions = await getReactionsForMessage(data.messageId);
        emitToGroup(message.groupId, "reaction:updated", { messageId: data.messageId, reactions });
      } catch (err) {
        console.error("[socket] reaction:toggle handler failed", err);
      }
    });

    socket.on("disconnect", async () => {
      try {
        const userSockets = onlineSockets.get(userId);
        if (!userSockets) return;
        userSockets.delete(socket.id);
        if (userSockets.size === 0) {
          onlineSockets.delete(userId);
          const lastSeenAt = new Date();
          await prisma.user.update({ where: { id: userId }, data: { lastSeenAt } });
          const groupIds = await groupIdsForUser(userId);
          for (const groupId of groupIds) {
            emitToGroup(groupId, "presence:update", { userId, online: false, lastSeenAt: lastSeenAt.toISOString() });
          }
        }
      } catch (err) {
        console.error("[socket] disconnect handler failed", err);
      }
    });

    // Broadcast "just came online" only after every listener above
    // (including "disconnect") is registered, and without awaiting it here -
    // an immediate disconnect during this lookup is now guaranteed to hit
    // the disconnect listener already in place above.
    if (wasOffline) {
      void broadcastOnlinePresence(userId);
    }
  });

  return io;
}

export function getIO(): SocketIOServer {
  if (!io) throw new Error("Socket.IO not initialized yet");
  return io;
}

export function emitToUser(userId: string, event: string, payload: unknown) {
  io?.to(`user:${userId}`).emit(event, payload);
}

export function emitToGroup(groupId: string, event: string, payload: unknown) {
  io?.to(`group:${groupId}`).emit(event, payload);
}
