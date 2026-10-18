import { Platform } from "react-native";

// Web only: a password-reset email opens /reset-password?token=... Read the token once
// at start-up and clean the address bar so the token isn't left in history or shared.
// Cached at module level: React StrictMode runs state initializers twice, and the second
// run would otherwise find the URL already cleaned.
let taken: string | null | undefined;

export function takeResetToken(): string | null {
  if (taken !== undefined) return taken;
  taken = null;
  if (Platform.OS !== "web" || typeof window === "undefined") return taken;
  const { pathname, search } = window.location;
  if (!pathname.replace(/\/+$/, "").endsWith("/reset-password")) return taken;
  const token = new URLSearchParams(search).get("token");
  // Keep the token out of Referer headers on anything this page loads from now on.
  const meta = document.createElement("meta");
  meta.name = "referrer";
  meta.content = "no-referrer";
  document.head.appendChild(meta);
  window.history.replaceState(null, "", "/");
  taken = token && token.length >= 20 ? token : null;
  return taken;
}

// Called when the reset screen closes, so a later remount doesn't show it again.
export function clearResetToken() {
  taken = null;
}
