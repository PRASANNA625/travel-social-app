import type { TripStatus } from "../types";

export const TRIP_STATUS_COLORS: Record<TripStatus, string> = {
  PLANNING: "#94a3b8",
  OPEN: "#0f766e",
  ALMOST_FULL: "#d97706",
  FULL: "#dc2626",
  STARTED: "#2563eb",
  COMPLETED: "#6b7280",
  CANCELLED: "#991b1b",
};

export const TRIP_STATUS_LABELS: Record<TripStatus, string> = {
  PLANNING: "Planning",
  OPEN: "Open",
  ALMOST_FULL: "Almost full",
  FULL: "Full",
  STARTED: "Started",
  COMPLETED: "Closed",
  CANCELLED: "Cancelled",
};
