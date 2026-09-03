import { io, Socket } from "socket.io-client";
import { API_URL } from "./client";
import { useAuthStore } from "../store/authStore";

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (socket) return socket;
  socket = io(API_URL, {
    auth: { token: useAuthStore.getState().token },
    transports: ["websocket"],
    autoConnect: true,
  });
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
