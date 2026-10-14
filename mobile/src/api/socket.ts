import { io, Socket } from "socket.io-client";
import { API_URL, signOutSuspended } from "./client";
import { useAuthStore } from "../store/authStore";

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (socket) return socket;
  socket = io(API_URL, {
    auth: { token: useAuthStore.getState().token },
    transports: ["websocket"],
    autoConnect: true,
  });
  socket.on("account:suspended", (payload: { reason?: string } | undefined) => signOutSuspended(payload?.reason));
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
