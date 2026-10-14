import { createContext, useContext, type ComponentProps } from "react";
import type { MaterialCommunityIcons } from "@expo/vector-icons";
import type { UserRole } from "../../api/admin";

type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

export type SectionKey =
  | "overview"
  | "users"
  | "trips"
  | "events"
  | "buddies"
  | "reports"
  | "notifications"
  | "config"
  | "reviews"
  | "analytics"
  | "roles"
  | "audit";

// Dashboard navigation, grouped. `minRole` mirrors the backend: sections a role
// can't use aren't offered (the API refuses them regardless).
export const SECTIONS: { group: string; items: { key: SectionKey; label: string; icon: IconName; minRole: UserRole }[] }[] = [
  {
    group: "Overview",
    items: [
      { key: "overview", label: "Dashboard", icon: "view-dashboard-outline", minRole: "MODERATOR" },
      { key: "analytics", label: "Analytics", icon: "chart-bar", minRole: "MODERATOR" },
    ],
  },
  {
    group: "Manage",
    items: [
      { key: "users", label: "Users", icon: "account-multiple-outline", minRole: "MODERATOR" },
      { key: "trips", label: "Trips", icon: "map-marker-path", minRole: "MODERATOR" },
      { key: "events", label: "Meetups & Events", icon: "calendar-account-outline", minRole: "MODERATOR" },
      { key: "buddies", label: "Travel Buddies", icon: "account-heart-outline", minRole: "MODERATOR" },
    ],
  },
  {
    group: "Moderate",
    items: [
      { key: "reports", label: "Reports", icon: "flag-outline", minRole: "MODERATOR" },
      { key: "reviews", label: "Reviews & Feedback", icon: "star-outline", minRole: "MODERATOR" },
    ],
  },
  {
    group: "System",
    items: [
      { key: "notifications", label: "Notifications", icon: "bullhorn-outline", minRole: "MODERATOR" },
      { key: "config", label: "Configuration", icon: "tune-variant", minRole: "MODERATOR" },
      { key: "roles", label: "Roles & Permissions", icon: "shield-account-outline", minRole: "MODERATOR" },
      { key: "audit", label: "Audit Log", icon: "history", minRole: "ADMIN" },
    ],
  },
];

export interface AdminNav {
  role: UserRole;
  myId: string;
  goTo: (section: SectionKey, params?: { search?: string; status?: string }) => void;
  openUser: (id: string) => void;
  openTrip: (id: string) => void;
  // Filters handed over by goTo (e.g. from the global search or an alert).
  initialParams: { search?: string; status?: string };
}

export const AdminNavContext = createContext<AdminNav | null>(null);

export function useAdminNav() {
  const nav = useContext(AdminNavContext);
  if (!nav) throw new Error("useAdminNav must be used inside the admin dashboard");
  return nav;
}
