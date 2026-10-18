import type { LanguageCode } from "../i18n/languages";

export const TRAVEL_MODES = [
  "BIKE",
  "CAR",
  "TRAIN",
  "FLIGHT",
  "BUS",
  "TREK",
  "CAMPING",
  "BEACH",
  "MOUNTAIN",
  "CYCLING",
  "WATER_ADVENTURE",
  "BACKPACKING",
  "WELLNESS",
  "PHOTOGRAPHY",
  "INTERNATIONAL",
  "OTHER",
] as const;

export type TravelMode = (typeof TRAVEL_MODES)[number];

export const TRAVEL_MODE_LABELS: Record<TravelMode, string> = {
  BIKE: "🏍️ Bike",
  CAR: "🚗 Car / Road trip",
  TRAIN: "🚆 Train",
  FLIGHT: "✈️ Flight",
  BUS: "🚌 Bus",
  TREK: "🚶 Trekking",
  CAMPING: "🏕️ Camping",
  BEACH: "🏖️ Beach",
  MOUNTAIN: "🏔️ Mountain",
  CYCLING: "🚲 Cycling",
  WATER_ADVENTURE: "🛶 Water adventure",
  BACKPACKING: "🎒 Backpacking",
  WELLNESS: "🧘 Wellness / Retreat",
  PHOTOGRAPHY: "📸 Photography",
  INTERNATIONAL: "🌍 International",
  OTHER: "🧭 Other",
};

// Travel trips and sports meetups share the Trip shape.
export type TripCategory = "TRAVEL" | "SPORTS";

export const SPORTS = [
  "CRICKET",
  "FOOTBALL",
  "BADMINTON",
  "TENNIS",
  "VOLLEYBALL",
  "BASKETBALL",
  "CYCLING",
  "RUNNING",
  "SWIMMING",
  "HIKING",
  "GYM",
  "OTHER",
] as const;
export type Sport = (typeof SPORTS)[number];

export const SKILL_LEVELS = ["ANY", "BEGINNER", "INTERMEDIATE", "ADVANCED"] as const;
export type SkillLevel = (typeof SKILL_LEVELS)[number];

export type JoinType = "OPEN" | "APPROVAL" | "INVITE_ONLY";
export type TripStatus = "PLANNING" | "OPEN" | "ALMOST_FULL" | "FULL" | "STARTED" | "COMPLETED" | "CANCELLED";
// INVITED: sent by the organizer, waiting for the invitee's answer.
export type JoinRequestStatus = "PENDING" | "APPROVED" | "REJECTED" | "INVITED";
export type GroupRole = "OWNER" | "MEMBER";
export type MessageType = "TEXT" | "IMAGE" | "AUDIO";

export interface User {
  id: string;
  name: string;
  photoUrl?: string | null;
  coverPhotoUrl?: string | null;
  age?: number | null;
  location?: string | null;
  bio?: string | null;
  interests: string[];
  preferredModes: TravelMode[];
  preferredLanguage?: LanguageCode;
  email?: string | null;
  phone?: string | null;
  phoneVerified?: boolean;
  createdAt: string;
  isBlocked?: boolean;
  // Only on the signed-in user's own profile.
  role?: "USER" | "MODERATOR" | "ADMIN" | "SUPER_ADMIN";
  // Only on the signed-in user's own profile: false for accounts that sign in with Google only.
  hasPassword?: boolean;
}

export interface TripOwnerSummary {
  id: string;
  name: string;
  photoUrl?: string | null;
}

export interface Trip {
  id: string;
  ownerId: string;
  owner: TripOwnerSummary;
  title: string;
  destination: string;
  startLocation: string;
  startLat?: number | null;
  startLng?: number | null;
  destLat?: number | null;
  destLng?: number | null;
  startDate: string;
  endDate: string;
  travelMode: TravelMode;
  category: TripCategory;
  // Sports meetups only; startDate carries the start time.
  sport?: Sport | null;
  durationMinutes?: number | null;
  skillLevel?: SkillLevel | null;
  budget?: number | null;
  seats: number;
  seatsFilled: number;
  description: string;
  placesToVisit: string[];
  groupSizeExpected?: number | null;
  images: string[];
  notes?: string | null;
  joinType: JoinType;
  status: TripStatus;
  createdAt: string;
  isLiked: boolean;
  isBookmarked: boolean;
  // The viewer's join request on this trip, if any (lists and detail).
  viewerJoinStatus?: JoinRequestStatus | null;
  distanceKm?: number;
  _count: { likes: number; comments: number; joinRequests: number };
  avgRating: number | null;
  reviewCount: number;
}

export interface TripComment {
  id: string;
  tripId: string;
  text: string;
  createdAt: string;
  user: TripOwnerSummary;
}

export interface TripReview {
  tripId: string;
  userId: string;
  rating: number;
  comment?: string | null;
  createdAt: string;
  updatedAt: string;
  user: TripOwnerSummary;
}

export interface TripReviewsResponse {
  items: TripReview[];
  avgRating: number | null;
  reviewCount: number;
  viewerCanReview: boolean;
  viewerReview: TripReview | null;
}

export interface JoinRequest {
  id: string;
  tripId: string;
  userId: string;
  status: JoinRequestStatus;
  message?: string | null;
  createdAt: string;
  user?: User;
  trip?: Trip;
}

export type BuddyConnectionState = "none" | "pending_sent" | "pending_received" | "connected";

export type ReportReason = "SPAM" | "HARASSMENT" | "FAKE_PROFILE" | "INAPPROPRIATE_CONTENT" | "SAFETY_CONCERN" | "OTHER";

export interface BuddyMatch extends Omit<User, "email" | "phone" | "phoneVerified"> {
  sharedInterests: string[];
  sharedModesCount: number;
  locationMatch: boolean;
  compatibilityPercent: number | null;
  connectionState: BuddyConnectionState;
  connectionRequestId: string | null;
  // Trips owned or joined; host rating is the review-weighted average of their own trips.
  tripCount: number;
  rating: number | null;
  ratingCount: number;
  // Only ever true for accepted buddies (presence isn't shared with strangers).
  online: boolean;
}

export interface BuddyConnection {
  id: string;
  fromUserId: string;
  toUserId: string;
  status: "PENDING" | "ACCEPTED" | "REJECTED";
  createdAt: string;
  fromUser?: User;
}

export interface GroupMember {
  userId: string;
  role: GroupRole;
  joinedAt: string;
  user: TripOwnerSummary;
}

export interface Group {
  id: string;
  tripId: string;
  trip: Trip;
  members: GroupMember[];
}

export interface MessageReactionSummary {
  emoji: string;
  count: number;
  userIds: string[];
}

export interface PresenceInfo {
  online: boolean;
  lastSeenAt: string | null;
}

export interface MessageReadEntry {
  userId: string;
  readAt: string;
}

export interface ChatMessage {
  id: string;
  groupId: string;
  senderId: string;
  type: MessageType;
  content?: string | null;
  mediaUrl?: string | null;
  durationMs?: number | null;
  createdAt: string;
  sender: TripOwnerSummary;
  reactions?: MessageReactionSummary[];
  readBy?: MessageReadEntry[];
  // Set when moderators removed it; content and media are withheld.
  removedAt?: string | null;
}

// One row of the Messages inbox (GET /groups/mine).
export interface GroupInboxItem {
  id: string;
  role: GroupRole;
  trip: Pick<Trip, "id" | "title" | "destination" | "images" | "travelMode" | "category" | "sport" | "startDate" | "endDate">;
  memberCount: number;
  lastMessage: {
    id: string;
    type: MessageType;
    content: string | null;
    createdAt: string;
    removedAt?: string | null;
    sender: { id: string; name: string };
  } | null;
  unreadCount: number;
  lastActivityAt: string;
}

export interface AppNotification {
  id: string;
  userId: string;
  type: string;
  payload: Record<string, unknown>;
  read: boolean;
  createdAt: string;
}

export interface AssistantMessage {
  role: "user" | "assistant";
  content: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  unreadCount?: number;
}
