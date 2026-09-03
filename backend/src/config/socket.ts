import type { Server as HttpServer } from "http";
import { Server as SocketIOServer, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { env } from "./env";
import { prisma } from "./prisma";

interface AuthedSocket extends Socket {
  userId?: string;
}

let io: SocketIOServer | undefined;

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
    socket.join(`user:${socket.userId}`);

    socket.on("group:join", async (groupId: string) => {
      const membership = await prisma.groupMember.findUnique({
        where: { groupId_userId: { groupId, userId: socket.userId! } },
      });
      if (membership) socket.join(`group:${groupId}`);
    });

    socket.on("group:leave", (groupId: string) => {
      socket.leave(`group:${groupId}`);
    });

    socket.on("message:send", async (data: { groupId: string; type?: "TEXT" | "IMAGE"; content?: string; mediaUrl?: string }) => {
      const membership = await prisma.groupMember.findUnique({
        where: { groupId_userId: { groupId: data.groupId, userId: socket.userId! } },
      });
      if (!membership) return;

      const message = await prisma.message.create({
        data: {
          groupId: data.groupId,
          senderId: socket.userId!,
          type: data.type ?? "TEXT",
          content: data.content,
          mediaUrl: data.mediaUrl,
        },
        include: { sender: { select: { id: true, name: true, photoUrl: true } } },
      });

      io!.to(`group:${data.groupId}`).emit("message:new", message);
    });
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
