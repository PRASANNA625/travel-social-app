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

export const createTripSchema = z.object({
  title: z.string().min(1),
  destination: z.string().min(1),
  startLocation: z.string().min(1),
  startLat: z.number().optional(),
  startLng: z.number().optional(),
  destLat: z.number().optional(),
  destLng: z.number().optional(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  travelMode: z.enum(travelModes),
  budget: z.number().nonnegative().optional(),
  seats: z.number().int().positive(),
  description: z.string().min(1),
  placesToVisit: z.array(z.string()).default([]),
  groupSizeExpected: z.number().int().positive().optional(),
  images: z.array(z.string()).default([]),
  notes: z.string().optional(),
  joinType: z.enum(joinTypes).default("APPROVAL"),
});

export const updateTripSchema = createTripSchema.partial().extend({
  status: z.enum(["PLANNING", "OPEN", "ALMOST_FULL", "FULL", "STARTED", "COMPLETED", "CANCELLED"]).optional(),
});

export const tripFiltersSchema = z.object({
  search: z.string().optional(),
  destination: z.string().optional(),
  travelMode: z.enum(travelModes).optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  budgetMin: z.coerce.number().optional(),
  budgetMax: z.coerce.number().optional(),
  lat: z.coerce.number().optional(),
  lng: z.coerce.number().optional(),
  radiusKm: z.coerce.number().optional(),
  page: z.coerce.number().optional(),
  pageSize: z.coerce.number().optional(),
});

export type CreateTripInput = z.infer<typeof createTripSchema>;
export type UpdateTripInput = z.infer<typeof updateTripSchema>;
export type TripFilters = z.infer<typeof tripFiltersSchema>;
