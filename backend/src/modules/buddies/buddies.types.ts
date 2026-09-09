import { z } from "zod";
import { travelModes } from "../trips/trips.types";

export const buddyFiltersSchema = z.object({
  search: z.string().optional(),
  interest: z.string().optional(),
  travelMode: z.enum(travelModes).optional(),
  location: z.string().optional(),
  page: z.coerce.number().optional(),
  pageSize: z.coerce.number().optional(),
});

export type BuddyFilters = z.infer<typeof buddyFiltersSchema>;
