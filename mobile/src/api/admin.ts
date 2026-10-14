import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "./client";
import type { TravelMode, TripStatus } from "../types";

// Admin dashboard API. Every endpoint is role-checked by the backend; the UI
// only mirrors those rules to avoid offering actions that would be refused.

export type UserRole = "USER" | "MODERATOR" | "ADMIN" | "SUPER_ADMIN";
export type AccountStatus = "ACTIVE" | "SUSPENDED";
export type ReportStatus = "OPEN" | "RESOLVED" | "DISMISSED";
export type ReportReason = "SPAM" | "HARASSMENT" | "FAKE_PROFILE" | "INAPPROPRIATE_CONTENT" | "SAFETY_CONCERN" | "OTHER";
export type FeedbackStatus = "NEW" | "IN_PROGRESS" | "RESOLVED";
export type Audience = "ALL" | "ACTIVE_30D" | "ORGANIZERS" | "STAFF";

export const ROLE_RANK: Record<UserRole, number> = { USER: 0, MODERATOR: 1, ADMIN: 2, SUPER_ADMIN: 3 };
export const isStaff = (role: UserRole | undefined) => !!role && role !== "USER";
export const atLeast = (role: UserRole | undefined, minimum: UserRole) => !!role && ROLE_RANK[role] >= ROLE_RANK[minimum];

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface Person {
  id: string;
  name: string;
  photoUrl: string | null;
  email?: string | null;
  status?: AccountStatus;
  role?: UserRole;
}

export interface AdminUser extends Person {
  phone: string | null;
  location: string | null;
  bio: string | null;
  age: number | null;
  interests: string[];
  preferredModes: TravelMode[];
  role: UserRole;
  status: AccountStatus;
  suspendedAt: string | null;
  suspendedReason: string | null;
  lastSeenAt: string | null;
  createdAt: string;
  _count: { trips: number; reportsReceived: number; groupMemberships: number };
}

export interface AuditEntry {
  id: string;
  action: string;
  targetType?: string;
  targetId?: string | null;
  details?: Record<string, unknown> | null;
  createdAt: string;
  actor: { id: string; name: string; role?: UserRole } | null;
}

export interface AdminUserDetail extends AdminUser {
  trips: { id: string; title: string; destination: string; status: TripStatus; startDate: string; hidden: boolean; featured: boolean }[];
  reportsReceived: { id: string; reason: ReportReason; details: string | null; status: ReportStatus; createdAt: string; reporter: Person }[];
  reportsMadeCount: number;
  auditTrail: AuditEntry[];
}

export interface AdminTrip {
  id: string;
  title: string;
  destination: string;
  startLocation: string;
  startDate: string;
  endDate: string;
  travelMode: TravelMode;
  status: TripStatus;
  featured: boolean;
  hidden: boolean;
  seats: number;
  seatsFilled: number;
  joinType: string;
  images: string[];
  avgRating: number | null;
  reviewCount: number;
  createdAt: string;
  owner: Person;
  _count: { joinRequests: number; comments: number; reviews: number; likes: number };
}

export interface AdminTripDetail extends AdminTrip {
  description: string;
  budget: number | null;
  group: { id: string; members: { role: "OWNER" | "MEMBER"; joinedAt: string; user: Person }[] } | null;
  joinRequests: { id: string; status: "PENDING" | "APPROVED" | "REJECTED"; message: string | null; createdAt: string; user: Person }[];
  auditTrail: AuditEntry[];
}

export interface AdminReport {
  id: string;
  reason: ReportReason;
  details: string | null;
  status: ReportStatus;
  resolutionNote: string | null;
  resolvedAt: string | null;
  createdAt: string;
  reporter: Person;
  reported: Person & { _count: { reportsReceived: number } };
  resolvedBy: { id: string; name: string } | null;
  // Message reports: the reported message as it was when reported.
  messageId: string | null;
  messageSnapshot: ReportedMessage | null;
  message: { removedAt: string | null; removedBy: { id: string; name: string } | null } | null;
}

export interface ReportedMessage {
  type: "TEXT" | "IMAGE" | "AUDIO";
  content: string | null;
  mediaUrl: string | null;
  durationMs: number | null;
  sentAt: string;
  groupId: string;
  tripId: string;
  tripTitle: string;
}

export interface AdminConnection {
  id: string;
  status: "PENDING" | "ACCEPTED" | "REJECTED";
  createdAt: string;
  fromUser: Person;
  toUser: Person;
}

export interface FlaggedAccount extends Person {
  location: string | null;
  createdAt: string;
  flags: string[];
  _count: { reportsReceived: number };
}

export interface AdminReview {
  tripId: string;
  userId: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  user: Person;
  trip: { id: string; title: string };
}

export interface AdminComment {
  id: string;
  text: string;
  createdAt: string;
  user: Person;
  trip: { id: string; title: string };
}

export interface AdminFeedback {
  id: string;
  kind: "REPORT" | "FEEDBACK";
  type: string;
  description: string;
  screenshotUrl: string | null;
  appVersion: string;
  platform: string;
  status: FeedbackStatus;
  createdAt: string;
  user: Person;
}

export interface DayCount {
  day: string;
  count: number;
}

export interface Overview {
  stats: {
    totalUsers: number;
    newUsers7d: number;
    suspendedUsers: number;
    activeTrips: number;
    upcomingTrips: number;
    pendingJoinRequests: number;
    pendingConnections: number;
    openReports: number;
    newFeedback: number;
  };
  series: { signups: DayCount[]; tripsCreated: DayCount[] };
  recentActivity: AuditEntry[];
  recentUsers: { id: string; name: string; photoUrl: string | null; location: string | null; createdAt: string }[];
  recentTrips: { id: string; title: string; destination: string; status: TripStatus; createdAt: string; owner: { id: string; name: string } }[];
}

export interface Analytics {
  days: number;
  series: { signups: DayCount[]; tripsCreated: DayCount[]; joinRequests: DayCount[]; messages: DayCount[]; connections: DayCount[] };
  popularDestinations: { destination: string; trips: number }[];
  travelModes: { travelMode: TravelMode; trips: number }[];
  activeUsers: number;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  audience: Audience;
  recipientCount: number;
  createdAt: string;
  createdBy: { id: string; name: string } | null;
}

export interface AppSettings {
  features: { aiAssistant: boolean; travelBuddies: boolean; tripCreation: boolean };
  disabledTravelModes: TravelMode[];
  suggestedInterests: string[];
  announcementBanner: string;
  announcementTemplates: { name: string; title: string; body: string }[];
}

type Params = Record<string, string | number | boolean | undefined>;

// Drops empty filters so they don't reach the query string.
function clean(params: Params) {
  return Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== ""));
}

function useAdminQuery<T>(key: unknown[], path: string, params: Params = {}, enabled = true) {
  return useQuery({
    queryKey: ["admin", ...key, clean(params)],
    queryFn: async () => (await apiClient.get<T>(path, { params: clean(params) })).data,
    placeholderData: keepPreviousData,
    enabled,
  });
}

// Every admin change can affect any admin view (counts, lists, audit log), so a
// successful mutation refreshes all admin queries.
function useAdminMutation<TVars, TResult = unknown>(fn: (vars: TVars) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin"] });
      queryClient.invalidateQueries({ queryKey: ["trips"] });
    },
  });
}

// --- Queries
export const useAdminMe = () =>
  useAdminQuery<{ id: string; name: string; email: string | null; photoUrl: string | null; role: UserRole }>(["me"], "/admin/me");
export const useAdminAlerts = () =>
  useAdminQuery<{ openReports: number; newFeedback: number; staleJoinRequests: number }>(["alerts"], "/admin/alerts");
export const useOverview = () => useAdminQuery<Overview>(["overview"], "/admin/overview");
export const useAnalytics = (days: number) => useAdminQuery<Analytics>(["analytics"], "/admin/analytics", { days });
export const useAdminUsers = (params: Params) => useAdminQuery<Page<AdminUser>>(["users"], "/admin/users", params);
export const useAdminUser = (id: string | null) => useAdminQuery<AdminUserDetail>(["user", id], `/admin/users/${id}`, {}, !!id);
export const useStaff = () => useAdminQuery<AdminUser[]>(["staff"], "/admin/staff");
export const useAdminTrips = (params: Params) => useAdminQuery<Page<AdminTrip>>(["trips"], "/admin/trips", params);
export const useAdminTrip = (id: string | null) => useAdminQuery<AdminTripDetail>(["trip", id], `/admin/trips/${id}`, {}, !!id);
export const useReports = (params: Params) => useAdminQuery<Page<AdminReport>>(["reports"], "/admin/reports", params);
export const useConnections = (params: Params) => useAdminQuery<Page<AdminConnection>>(["connections"], "/admin/connections", params);
export const useFlaggedAccounts = () => useAdminQuery<FlaggedAccount[]>(["flagged"], "/admin/flagged-accounts");
export const useAdminReviews = (params: Params) => useAdminQuery<Page<AdminReview>>(["reviews"], "/admin/reviews", params);
export const useAdminComments = (params: Params) => useAdminQuery<Page<AdminComment>>(["comments"], "/admin/comments", params);
export const useAdminFeedback = (params: Params) => useAdminQuery<Page<AdminFeedback>>(["feedback"], "/admin/feedback", params);
export const useAnnouncements = (params: Params) => useAdminQuery<Page<Announcement>>(["announcements"], "/admin/announcements", params);
export const useAudienceSize = (audience: Audience) =>
  useAdminQuery<{ count: number }>(["audience"], "/admin/announcements/audience-size", { audience });
export const useNotificationStats = () => useAdminQuery<{ type: string; count: number }[]>(["notification-stats"], "/admin/notification-stats");
export const useAdminSettings = () => useAdminQuery<AppSettings>(["settings"], "/admin/settings");
export const useAudit = (params: Params) => useAdminQuery<Page<AuditEntry>>(["audit"], "/admin/audit", params);

// --- Mutations
export const useUpdateUser = () =>
  useAdminMutation(({ id, ...data }: { id: string; name?: string; location?: string | null; bio?: string | null }) =>
    apiClient.patch(`/admin/users/${id}`, data)
  );
export const useSuspendUser = () =>
  useAdminMutation(({ id, reason }: { id: string; reason: string }) => apiClient.post(`/admin/users/${id}/suspend`, { reason }));
export const useActivateUser = () => useAdminMutation((id: string) => apiClient.post(`/admin/users/${id}/activate`));
export const useBulkUsers = () =>
  useAdminMutation(
    async (body: { ids: string[]; action: "suspend" | "activate"; reason?: string }) =>
      (await apiClient.post<{ succeeded: number; results: { id: string; ok: boolean; error?: string }[] }>("/admin/users/bulk", body)).data
  );
export const useSetRole = () =>
  useAdminMutation(({ id, role }: { id: string; role: UserRole }) => apiClient.patch(`/admin/users/${id}/role`, { role }));
export const useUpdateTrip = () =>
  useAdminMutation(({ id, ...data }: { id: string } & Partial<Pick<AdminTrip, "title" | "destination" | "startDate" | "endDate" | "travelMode" | "status" | "featured" | "hidden">>) =>
    apiClient.patch(`/admin/trips/${id}`, data)
  );
export const useBulkTrips = () =>
  useAdminMutation((body: { ids: string[]; action: "feature" | "unfeature" | "hide" | "unhide" | "cancel" | "close" }) =>
    apiClient.post("/admin/trips/bulk", body)
  );
export const useDeleteTrip = () =>
  useAdminMutation(({ id, reason }: { id: string; reason: string }) => apiClient.delete(`/admin/trips/${id}`, { data: { reason } }));
export const useDecideJoinRequest = () =>
  useAdminMutation(({ id, approve }: { id: string; approve: boolean }) => apiClient.post(`/admin/join-requests/${id}/decision`, { approve }));
export const useRemoveParticipant = () =>
  useAdminMutation(({ tripId, userId, reason }: { tripId: string; userId: string; reason: string }) =>
    apiClient.delete(`/admin/trips/${tripId}/participants/${userId}`, { data: { reason } })
  );
export const useResolveReport = () =>
  useAdminMutation(({ id, ...body }: { id: string; status: ReportStatus; note?: string; suspendReported?: boolean }) =>
    apiClient.patch(`/admin/reports/${id}`, body)
  );
export const useRemoveMessage = () =>
  useAdminMutation(({ id, reason }: { id: string; reason: string }) => apiClient.post(`/admin/messages/${id}/remove`, { reason }));
export const useDeleteConnection = () => useAdminMutation((id: string) => apiClient.delete(`/admin/connections/${id}`));
export const useDeleteReview = () =>
  useAdminMutation(({ tripId, userId, reason }: { tripId: string; userId: string; reason: string }) =>
    apiClient.delete(`/admin/reviews/${tripId}/${userId}`, { data: { reason } })
  );
export const useDeleteComment = () =>
  useAdminMutation(({ id, reason }: { id: string; reason: string }) => apiClient.delete(`/admin/comments/${id}`, { data: { reason } }));
export const useSetFeedbackStatus = () =>
  useAdminMutation(({ id, status }: { id: string; status: FeedbackStatus }) => apiClient.patch(`/admin/feedback/${id}`, { status }));
export const useSendAnnouncement = () =>
  useAdminMutation((body: { title: string; body: string; audience: Audience }) => apiClient.post("/admin/announcements", body));
export const useSaveSettings = () => useAdminMutation((settings: AppSettings) => apiClient.put("/admin/settings", settings));

// CSV exports come back as text; on web they're saved through a temporary link.
export async function downloadExport(type: "users" | "trips" | "destinations") {
  const res = await apiClient.get<string>(`/admin/export/${type}`, { responseType: "text" });
  const date = new Date().toISOString().slice(0, 10);
  if (typeof document !== "undefined") {
    const url = URL.createObjectURL(new Blob([res.data], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `triply-${type}-${date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return res.data;
}

// Readable message from an API error, for toasts and inline errors.
export function errorMessage(err: unknown, fallback = "Something went wrong. Please try again.") {
  const e = err as { response?: { data?: { error?: string; details?: { fieldErrors?: Record<string, string[]> } } } };
  const fieldErrors = e?.response?.data?.details?.fieldErrors;
  const firstField = fieldErrors && Object.values(fieldErrors).flat()[0];
  return firstField ?? e?.response?.data?.error ?? fallback;
}
