import type { ComponentProps } from "react";
import type { MaterialCommunityIcons } from "@expo/vector-icons";
import type { TravelMode } from "../types";
import { TRAVEL_MODE_ICONS, travelModeText } from "./travelModeIcons";

type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

export interface TagStyle {
  label: string;
  icon: IconName;
  color: string;
  bg: string;
}

// Tinted pill colors per theme of interest; unknown free-text interests fall back to teal.
const TINTS = {
  green: { color: "#15803d", bg: "#dcfce7" },
  amber: { color: "#b45309", bg: "#fef3c7" },
  purple: { color: "#6d28d9", bg: "#ede9fe" },
  orange: { color: "#c2410c", bg: "#ffedd5" },
  blue: { color: "#1d4ed8", bg: "#dbeafe" },
  sky: { color: "#0369a1", bg: "#e0f2fe" },
  rose: { color: "#be123c", bg: "#ffe4e6" },
  teal: { color: "#0f766e", bg: "#ccfbf1" },
  slate: { color: "#334155", bg: "#e2e8f0" },
};

// Profile interests (EditProfileScreen options plus common free-text ones), keyed lowercase.
const INTEREST_TAGS: Record<string, { icon: IconName; tint: keyof typeof TINTS }> = {
  trekking: { icon: "hiking", tint: "green" },
  hiking: { icon: "hiking", tint: "green" },
  adventure: { icon: "terrain", tint: "green" },
  nature: { icon: "leaf", tint: "green" },
  camping: { icon: "tent", tint: "amber" },
  photography: { icon: "camera", tint: "purple" },
  beaches: { icon: "beach", tint: "orange" },
  beach: { icon: "beach", tint: "orange" },
  food: { icon: "silverware-fork-knife", tint: "rose" },
  culture: { icon: "bank", tint: "purple" },
  nightlife: { icon: "glass-cocktail", tint: "rose" },
  wildlife: { icon: "paw", tint: "amber" },
  diving: { icon: "diving-scuba", tint: "sky" },
  mountains: { icon: "image-filter-hdr", tint: "blue" },
};

const TRAVEL_MODE_TINTS: Record<TravelMode, keyof typeof TINTS> = {
  BIKE: "rose",
  CAR: "blue",
  TRAIN: "purple",
  FLIGHT: "blue",
  BUS: "amber",
  TREK: "green",
  CAMPING: "amber",
  BEACH: "orange",
  MOUNTAIN: "blue",
  CYCLING: "rose",
  WATER_ADVENTURE: "sky",
  BACKPACKING: "rose",
  WELLNESS: "rose",
  PHOTOGRAPHY: "purple",
  INTERNATIONAL: "teal",
  OTHER: "slate",
};

export function interestTag(interest: string): TagStyle {
  const known = INTEREST_TAGS[interest.trim().toLowerCase()];
  const tint = TINTS[known?.tint ?? "teal"];
  return { label: interest, icon: known?.icon ?? "tag-outline", ...tint };
}

export function travelModeTag(mode: TravelMode): TagStyle {
  return { label: travelModeText(mode), icon: TRAVEL_MODE_ICONS[mode], ...TINTS[TRAVEL_MODE_TINTS[mode]] };
}

// Interests first, then travel modes, skipping a mode whose label repeats an interest
// (e.g. interest "Trekking" + mode TREK) so cards don't show the same tag twice.
export function buddyTags(interests: string[], modes: TravelMode[], max: number): TagStyle[] {
  const tags = interests.map(interestTag);
  const seen = new Set(tags.map((t) => t.label.toLowerCase()));
  for (const mode of modes) {
    const tag = travelModeTag(mode);
    if (!seen.has(tag.label.toLowerCase())) {
      tags.push(tag);
      seen.add(tag.label.toLowerCase());
    }
  }
  return tags.slice(0, max);
}
