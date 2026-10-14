import { TravelMode, type Prisma } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma";

// App configuration editable from the admin dashboard. Stored as one row per key in
// AppSetting; anything not stored yet falls back to these defaults.
export const settingsSchema = z.object({
  // Feature switches the apps read from GET /config (and the backend enforces).
  features: z.object({
    aiAssistant: z.boolean(),
    travelBuddies: z.boolean(),
    tripCreation: z.boolean(),
  }),
  // Travel modes hidden from filters and from the create-trip form.
  disabledTravelModes: z.array(z.nativeEnum(TravelMode)),
  // Suggested interests shown when people edit their profile.
  suggestedInterests: z.array(z.string().trim().min(1).max(40)).max(60),
  // Optional banner shown at the top of Discover (empty = none).
  announcementBanner: z.string().max(200),
  // Reusable announcement templates for the Notifications page.
  announcementTemplates: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(40),
        title: z.string().trim().min(3).max(80),
        body: z.string().trim().min(3).max(500),
      })
    )
    .max(20),
});

export type AppSettings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: AppSettings = {
  features: { aiAssistant: true, travelBuddies: true, tripCreation: true },
  disabledTravelModes: [],
  suggestedInterests: [
    "Trekking",
    "Photography",
    "Camping",
    "Food",
    "Culture",
    "Beaches",
    "Mountains",
    "Road trips",
    "Wildlife",
    "Backpacking",
  ],
  announcementBanner: "",
  announcementTemplates: [
    {
      name: "Scheduled maintenance",
      title: "Scheduled maintenance",
      body: "Triply will be briefly unavailable for maintenance. Thanks for your patience!",
    },
    {
      name: "New feature",
      title: "Something new on Triply",
      body: "We've added a new feature to help you plan trips together. Open the app to try it out.",
    },
  ],
};

const KEYS = Object.keys(DEFAULT_SETTINGS) as (keyof AppSettings)[];

export async function getSettings(): Promise<AppSettings> {
  const rows = await prisma.appSetting.findMany({ where: { key: { in: KEYS } } });
  const merged: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const row of rows) {
    // Nested objects merge over their defaults so a newly added switch gets its default.
    const fallback = DEFAULT_SETTINGS[row.key as keyof AppSettings];
    merged[row.key] =
      fallback && typeof fallback === "object" && !Array.isArray(fallback)
        ? { ...fallback, ...(row.value as object) }
        : row.value;
  }
  // Anything invalid in storage falls back to defaults rather than breaking the apps.
  const parsed = settingsSchema.safeParse(merged);
  return parsed.success ? parsed.data : DEFAULT_SETTINGS;
}

export async function updateSettings(input: AppSettings, actorId: string) {
  await prisma.$transaction(
    KEYS.map((key) =>
      prisma.appSetting.upsert({
        where: { key },
        update: { value: input[key] as Prisma.InputJsonValue, updatedById: actorId },
        create: { key, value: input[key] as Prisma.InputJsonValue, updatedById: actorId },
      })
    )
  );
  clearSettingsCache();
  return getSettings();
}

// Blocks an API while its feature is switched off in the admin dashboard, so turning a
// feature off isn't just hidden in the apps. The check reads settings at most every 30s.
let cached: { value: AppSettings; at: number } | null = null;
const SETTINGS_TTL_MS = 30_000;

export async function getSettingsCached() {
  if (cached && Date.now() - cached.at < SETTINGS_TTL_MS) return cached.value;
  cached = { value: await getSettings(), at: Date.now() };
  return cached.value;
}

export function clearSettingsCache() {
  cached = null;
}

export function requireFeature(feature: keyof AppSettings["features"]) {
  return async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const settings = await getSettingsCached();
      if (!settings.features[feature]) {
        return res.status(403).json({ error: "This feature is currently turned off", code: "FEATURE_DISABLED" });
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
