import { z } from "zod";

export const travelModes = [
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

export const joinTypes = ["OPEN", "APPROVAL", "INVITE_ONLY"] as const;

export const tripCategories = ["TRAVEL", "SPORTS"] as const;
export const sports = [
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
export const skillLevels = ["ANY", "BEGINNER", "INTERMEDIATE", "ADVANCED"] as const;

export const createTripSchema = z.object({
  title: z.string().min(1),
  destination: z.string().min(1),
  startLocation: z.string().min(1),
  startLat: z.number().nullish(),
  startLng: z.number().nullish(),
  destLat: z.number().nullish(),
  destLng: z.number().nullish(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  // Required for travel trips; sports meetups default it to OTHER.
  travelMode: z.enum(travelModes).optional(),
  category: z.enum(tripCategories).default("TRAVEL"),
  sport: z.enum(sports).optional(),
  // 15 minutes to 12 hours.
  durationMinutes: z.number().int().min(15).max(720).optional(),
  skillLevel: z.enum(skillLevels).optional(),
  budget: z.number().nonnegative().optional(),
  seats: z.number().int().positive(),
  description: z.string().min(1),
  placesToVisit: z.array(z.string()).default([]),
  groupSizeExpected: z.number().int().positive().optional(),
  images: z.array(z.string()).default([]),
  notes: z.string().optional(),
  joinType: z.enum(joinTypes).default("APPROVAL"),
});

// A trip can't switch between travel and sports after it's created.
export const updateTripSchema = createTripSchema.omit({ category: true }).partial().extend({
  status: z.enum(["PLANNING", "OPEN", "ALMOST_FULL", "FULL", "STARTED", "COMPLETED", "CANCELLED"]).optional(),
});

const travelModeSet = new Set<string>(travelModes);
const sportSet = new Set<string>(sports);

export const tripFiltersSchema = z.object({
  search: z.string().optional(),
  destination: z.string().optional(),
  // Accepts a single mode ("BIKE") or a comma-separated list ("BIKE,TREK")
  // for multi-select filtering; unknown values are silently dropped.
  travelMode: z
    .string()
    .optional()
    .transform((val) => {
      if (!val) return undefined;
      const modes = val
        .split(",")
        .map((m) => m.trim())
        .filter((m): m is (typeof travelModes)[number] => travelModeSet.has(m));
      return modes.length > 0 ? modes : undefined;
    }),
  category: z.enum(tripCategories).optional(),
  // One sport or a comma-separated list ("FOOTBALL,CRICKET").
  sport: z
    .string()
    .optional()
    .transform((val) => {
      if (!val) return undefined;
      const list = val
        .split(",")
        .map((s) => s.trim())
        .filter((s): s is (typeof sports)[number] => sportSet.has(s));
      return list.length > 0 ? list : undefined;
    }),
  // A level also matches meetups open to all levels.
  skillLevel: z.enum(skillLevels).optional(),
  // "true": only meetups that still take participants.
  openSlots: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
  // "true": only meetups that haven't started yet.
  upcoming: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  budgetMin: z.coerce.number().optional(),
  budgetMax: z.coerce.number().optional(),
  lat: z.coerce.number().optional(),
  lng: z.coerce.number().optional(),
  radiusKm: z.coerce.number().optional(),
  // Sorts by trip start date. Ignored when Near Me is active, since that
  // mode sorts by distance instead.
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
  page: z.coerce.number().optional(),
  pageSize: z.coerce.number().optional(),
});

export type CreateTripInput = z.infer<typeof createTripSchema>;
export type UpdateTripInput = z.infer<typeof updateTripSchema>;
export type TripFilters = z.infer<typeof tripFiltersSchema>;
