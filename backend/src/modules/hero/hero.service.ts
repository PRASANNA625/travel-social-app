import { z } from "zod";
import type { HeroBanner, Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { HttpError } from "../../middleware/error";
import { logAction } from "../admin/audit";
import { deleteHeroMedia, isOurMediaUrl } from "./hero.media";

// --- Carousel settings (one AppSetting row) ------------------------------------------

const SETTINGS_KEY = "heroCarousel";

export const heroSettingsSchema = z.object({
  intervalSeconds: z.number().int().min(3).max(30),
  transition: z.enum(["fade", "slide"]),
});
export type HeroSettings = z.infer<typeof heroSettingsSchema>;
const DEFAULT_SETTINGS: HeroSettings = { intervalSeconds: 7, transition: "fade" };

export async function getHeroSettings(): Promise<HeroSettings> {
  const row = await prisma.appSetting.findUnique({ where: { key: SETTINGS_KEY } });
  const parsed = heroSettingsSchema.safeParse(row?.value);
  return parsed.success ? parsed.data : DEFAULT_SETTINGS;
}

export async function updateHeroSettings(input: HeroSettings, actorId: string) {
  const value = heroSettingsSchema.parse(input);
  await prisma.appSetting.upsert({
    where: { key: SETTINGS_KEY },
    update: { value, updatedById: actorId },
    create: { key: SETTINGS_KEY, value, updatedById: actorId },
  });
  await logAction(actorId, "hero.settings", "SETTINGS", SETTINGS_KEY, value);
  return value;
}

// --- Banner input ----------------------------------------------------------------------

// In-app destinations a button can open, or any https link.
export const INTERNAL_CTA = /^\/(create-trip|create-activity|sports|meetups|my-trips|trip\/[a-z0-9]{8,40})$/;
const ctaUrl = z
  .string()
  .trim()
  .max(500)
  .refine((v) => INTERNAL_CTA.test(v) || /^https:\/\/[^\s<>"']+$/.test(v), "Use an https:// link or one of the in-app destinations");
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));
const mediaKey = z.string().regex(/^(cloudinary:(image|video):[\w/.-]+|local:hero\/[\w.-]+)$/, "Unknown media");

const bannerFields = z.object({
  title: z.string().trim().min(1, "Give the banner a name").max(80),
  status: z.enum(["DRAFT", "PUBLISHED", "SCHEDULED", "ARCHIVED"]),
  mediaType: z.enum(["IMAGE", "VIDEO"]),
  mediaUrl: z.string().url().max(600),
  mediaKey,
  posterUrl: z.string().url().max(600).nullish(),
  posterKey: mediaKey.nullish(),
  focalPoint: z.enum(["center", "top", "bottom", "left", "right"]),
  heading: optionalText(60),
  subtitle: optionalText(160),
  // Up to three short lines, written one per line or separated by commas.
  tagline: optionalText(60),
  textColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #FFFFFF"),
  overlayOpacity: z.number().min(0).max(0.85),
  textAlign: z.enum(["LEFT", "CENTER", "RIGHT"]),
  ctaLabel: optionalText(30),
  ctaUrl: ctaUrl.nullish().transform((v) => (v ? v : null)),
  startsAt: z.coerce.date().nullish(),
  endsAt: z.coerce.date().nullish(),
});

function checkBanner(b: z.infer<typeof bannerFields>, isNew: boolean) {
  if (!isOurMediaUrl(b.mediaUrl) || (b.posterUrl && !isOurMediaUrl(b.posterUrl))) {
    throw new HttpError(400, "Upload media through the dashboard; outside links aren't allowed.");
  }
  // The stored key must name the same file as the URL, so deleting a banner removes its own media.
  const keyMatches = (url: string, key: string) => url.includes(key.replace(/^cloudinary:(image|video):|^local:/, ""));
  if (!keyMatches(b.mediaUrl, b.mediaKey) || (b.posterUrl && b.posterKey && !keyMatches(b.posterUrl, b.posterKey))) {
    throw new HttpError(400, "The media details don't match. Upload the file again.");
  }
  if (!!b.ctaLabel !== !!b.ctaUrl) throw new HttpError(400, "A button needs both a label and a destination.");
  if (b.startsAt && b.endsAt && b.endsAt <= b.startsAt) throw new HttpError(400, "The end time must be after the start time.");
  if (b.status === "SCHEDULED") {
    if (!b.startsAt) throw new HttpError(400, "Pick a start time to schedule this banner.");
    if (isNew && b.startsAt <= new Date()) throw new HttpError(400, "A scheduled banner has to start in the future. Publish it instead.");
  }
  if ((b.status === "PUBLISHED" || b.status === "SCHEDULED") && b.endsAt && b.endsAt <= new Date()) {
    throw new HttpError(400, "That end time has already passed.");
  }
}

export const createBannerSchema = bannerFields;
export const updateBannerSchema = bannerFields.partial();

// --- Live window ---------------------------------------------------------------------

// Shown on Discover: published or scheduled, inside its start/end window.
function liveWhere(now = new Date()): Prisma.HeroBannerWhereInput {
  return {
    status: { in: ["PUBLISHED", "SCHEDULED"] },
    AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
  };
}

// What the dashboard shows as the banner's state right now.
export function bannerState(b: Pick<HeroBanner, "status" | "startsAt" | "endsAt">, now = new Date()) {
  if (b.status === "DRAFT" || b.status === "ARCHIVED") return b.status;
  if (b.endsAt && b.endsAt <= now) return "ENDED";
  if (b.startsAt && b.startsAt > now) return "SCHEDULED";
  return "LIVE";
}

const PUBLIC_FIELDS = {
  id: true,
  mediaType: true,
  mediaUrl: true,
  posterUrl: true,
  focalPoint: true,
  heading: true,
  subtitle: true,
  tagline: true,
  textColor: true,
  overlayOpacity: true,
  textAlign: true,
  ctaLabel: true,
  ctaUrl: true,
} satisfies Prisma.HeroBannerSelect;

export async function listLiveBanners() {
  const [banners, settings] = await Promise.all([
    prisma.heroBanner.findMany({ where: liveWhere(), orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }], select: PUBLIC_FIELDS, take: 10 }),
    getHeroSettings(),
  ]);
  return { settings, banners };
}

export async function listAllBanners() {
  const [banners, settings] = await Promise.all([
    prisma.heroBanner.findMany({ orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }] }),
    getHeroSettings(),
  ]);
  const now = new Date();
  return { settings, banners: banners.map((b) => ({ ...b, state: bannerState(b, now) })) };
}

// --- Changes ---------------------------------------------------------------------------

export async function createBanner(input: unknown, actorId: string) {
  const data = createBannerSchema.parse(input);
  checkBanner(data, true);
  const last = await prisma.heroBanner.aggregate({ _max: { displayOrder: true } });
  const banner = await prisma.heroBanner.create({
    data: { ...data, displayOrder: (last._max.displayOrder ?? -1) + 1, createdById: actorId, updatedById: actorId },
  });
  await logAction(actorId, "hero.create", "HERO_BANNER", banner.id, { title: banner.title, status: banner.status });
  return banner;
}

export async function updateBanner(id: string, input: unknown, actorId: string) {
  const existing = await prisma.heroBanner.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, "Banner not found");
  const patch = updateBannerSchema.parse(input);
  const merged = bannerFields.parse({ ...existing, ...patch });
  checkBanner(merged, false);
  const banner = await prisma.heroBanner.update({ where: { id }, data: { ...patch, updatedById: actorId } });
  // Replaced files are no longer referenced anywhere.
  if (patch.mediaKey && patch.mediaKey !== existing.mediaKey) await deleteHeroMedia(existing.mediaKey);
  if (patch.posterKey !== undefined && patch.posterKey !== existing.posterKey) await deleteHeroMedia(existing.posterKey);
  const statusChanged = patch.status && patch.status !== existing.status;
  await logAction(actorId, statusChanged ? `hero.${patch.status!.toLowerCase()}` : "hero.update", "HERO_BANNER", id, {
    title: banner.title,
    fields: Object.keys(patch),
  });
  return banner;
}

export async function reorderBanners(ids: string[], actorId: string) {
  const count = await prisma.heroBanner.count({ where: { id: { in: ids } } });
  if (count !== ids.length) throw new HttpError(400, "Some banners no longer exist. Refresh and try again.");
  await prisma.$transaction(ids.map((id, i) => prisma.heroBanner.update({ where: { id }, data: { displayOrder: i } })));
  await logAction(actorId, "hero.reorder", "HERO_BANNER", null, { order: ids });
}

export async function deleteBanner(id: string, actorId: string) {
  const existing = await prisma.heroBanner.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, "Banner not found");
  await prisma.heroBanner.delete({ where: { id } });
  await Promise.all([deleteHeroMedia(existing.mediaKey), deleteHeroMedia(existing.posterKey)]);
  await logAction(actorId, "hero.delete", "HERO_BANNER", id, { title: existing.title });
}
