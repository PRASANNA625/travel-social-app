import type { ComponentProps } from "react";
import type { MaterialCommunityIcons } from "@expo/vector-icons";
import type { SkillLevel, Sport, Trip } from "../types";

type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

// Each sport's label, icon and card gradient (dark enough for white text).
export const SPORT_INFO: Record<Sport, { label: string; icon: IconName; colors: [string, string] }> = {
  CRICKET: { label: "Cricket", icon: "cricket", colors: ["#15803d", "#14532d"] },
  FOOTBALL: { label: "Football", icon: "soccer", colors: ["#16a34a", "#065f46"] },
  BADMINTON: { label: "Badminton", icon: "badminton", colors: ["#0891b2", "#164e63"] },
  TENNIS: { label: "Tennis", icon: "tennis", colors: ["#65a30d", "#3f6212"] },
  VOLLEYBALL: { label: "Volleyball", icon: "volleyball", colors: ["#d97706", "#92400e"] },
  BASKETBALL: { label: "Basketball", icon: "basketball", colors: ["#ea580c", "#9a3412"] },
  CYCLING: { label: "Cycling", icon: "bike", colors: ["#2563eb", "#1e3a8a"] },
  RUNNING: { label: "Running", icon: "run-fast", colors: ["#db2777", "#831843"] },
  SWIMMING: { label: "Swimming", icon: "swim", colors: ["#0284c7", "#0c4a6e"] },
  HIKING: { label: "Hiking", icon: "hiking", colors: ["#0f766e", "#134e4a"] },
  GYM: { label: "Gym / Fitness", icon: "dumbbell", colors: ["#7c3aed", "#4c1d95"] },
  OTHER: { label: "Other sports", icon: "trophy-outline", colors: ["#475569", "#1e293b"] },
};

export const SKILL_LABELS: Record<SkillLevel, string> = {
  ANY: "All levels",
  BEGINNER: "Beginner",
  INTERMEDIATE: "Intermediate",
  ADVANCED: "Advanced",
};

export const DURATION_OPTIONS = [30, 60, 90, 120, 180, 240];

export function formatDuration(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m} min`;
  return m ? `${h}h ${m}m` : `${h} hr${h > 1 ? "s" : ""}`;
}

export const isSports = (trip: Pick<Trip, "category">) => trip.category === "SPORTS";

// "Sat, 12 Oct · 7:00 AM"
export function formatSportsTime(iso: string) {
  const d = new Date(iso);
  const day = d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${day} · ${time}`;
}

export function slotsLeft(trip: Pick<Trip, "seats" | "seatsFilled">) {
  return Math.max(0, trip.seats - trip.seatsFilled);
}
