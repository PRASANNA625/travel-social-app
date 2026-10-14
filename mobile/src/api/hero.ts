import { useQuery } from "@tanstack/react-query";
import { apiClient } from "./client";

export type HeroMediaType = "IMAGE" | "VIDEO";
export type HeroTextAlign = "LEFT" | "CENTER" | "RIGHT";
export type HeroFocalPoint = "center" | "top" | "bottom" | "left" | "right";
export type HeroTransition = "fade" | "slide";

// What Discover needs to draw one slide (the public API sends only these fields).
export interface HeroSlide {
  id: string;
  mediaType: HeroMediaType;
  mediaUrl: string;
  posterUrl: string | null;
  focalPoint: HeroFocalPoint;
  heading: string | null;
  subtitle: string | null;
  tagline: string | null;
  textColor: string;
  overlayOpacity: number;
  textAlign: HeroTextAlign;
  ctaLabel: string | null;
  ctaUrl: string | null;
}

export interface HeroSettings {
  intervalSeconds: number;
  transition: HeroTransition;
}

export const DEFAULT_HERO_SETTINGS: HeroSettings = { intervalSeconds: 7, transition: "fade" };

// Banners live on Discover right now. Refreshed every few minutes so newly
// published or scheduled banners appear without reopening the app.
export function useHeroBanners() {
  return useQuery({
    queryKey: ["hero"],
    queryFn: async () => (await apiClient.get<{ settings: HeroSettings; banners: HeroSlide[] }>("/hero")).data,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });
}

// "Explore, Connect, Belong" or one word per line -> up to three lines.
export function taglineLines(tagline: string | null | undefined) {
  return (tagline ?? "")
    .split(/[\n,·]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 3);
}

// In-app places a banner button can open (anything else must be an https link).
export const HERO_DESTINATIONS: { value: string; label: string }[] = [
  { value: "/sports", label: "Sports & Activities" },
  { value: "/create-trip", label: "Create a trip" },
  { value: "/create-activity", label: "Create an activity" },
  { value: "/meetups", label: "Meetups" },
  { value: "/my-trips", label: "My Trips" },
];
