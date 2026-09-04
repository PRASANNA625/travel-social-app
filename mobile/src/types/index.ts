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

export type JoinType = "OPEN" | "APPROVAL" | "INVITE_ONLY";
export type TripStatus = "PLANNING" | "OPEN" | "ALMOST_FULL" | "FULL" | "STARTED" | "COMPLETED" | "CANCELLED";
export type JoinRequestStatus = "PENDING" | "APPROVED" | "REJECTED";
export type GroupRole = "OWNER" | "MEMBER";
export type MessageType = "TEXT" | "IMAGE";

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
  email?: string | null;
  phone?: string | null;
  phoneVerified?: boolean;
  createdAt: string;
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
  startDate: string;
  endDate: string;
  travelMode: TravelMode;
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
  distanceKm?: number;
  _count: { likes: number; comments: number; joinRequests: number };
}

export interface TripComment {
  id: string;
  tripId: string;
  text: string;
  createdAt: string;
  user: TripOwnerSummary;
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

export interface ChatMessage {
  id: string;
  groupId: string;
  senderId: string;
  type: MessageType;
  content?: string | null;
  mediaUrl?: string | null;
  createdAt: string;
  sender: TripOwnerSummary;
}

export interface AppNotification {
  id: string;
  userId: string;
  type: string;
  payload: Record<string, unknown>;
  read: boolean;
  createdAt: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  unreadCount?: number;
}
