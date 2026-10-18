import { io, Socket } from "socket.io-client";
import { API_URL, signOutSuspended } from "./client";
import { useAuthStore } from "../store/authStore";

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (socket) return socket;
  socket = io(API_URL, {
    // Read on every (re)connect, so a token swapped after a password change is used.
    auth: (cb) => cb({ token: useAuthStore.getState().token }),
    transports: ["websocket"],
    autoConnect: true,
  });
  socket.on("account:suspended", (payload: { reason?: string } | undefined) => signOutSuspended(payload?.reason));
  // The server drops sockets after a password change; reconnect with the current token.
  socket.on("disconnect", (reason) => {
    if (reason === "io server disconnect" && useAuthStore.getState().token) socket?.connect();
  });
  // A reconnect that raced the password change used the old token; retry once, by
  // which time the new token is normally in place. (Other devices are signed out by
  // their next API call.)
  let retriedExpired = false;
  socket.on("connect", () => (retriedExpired = false));
  socket.on("connect_error", (err) => {
    if (err.message !== "Session expired" || retriedExpired || !useAuthStore.getState().token) return;
    retriedExpired = true;
    setTimeout(() => socket?.connect(), 1500);
  });
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}

// After a password change the server drops this socket and refuses the old token on
// reconnect; connect again once the new token is in place.
export function reconnectSocket() {
  if (socket && !socket.connected) socket.connect();
}
