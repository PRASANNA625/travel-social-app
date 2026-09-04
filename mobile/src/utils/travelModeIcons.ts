import type { ComponentProps } from "react";
import type { MaterialCommunityIcons } from "@expo/vector-icons";
import { TRAVEL_MODE_LABELS, type TravelMode } from "../types";

type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

export const TRAVEL_MODE_ICONS: Record<TravelMode, IconName> = {
  BIKE: "motorbike",
  CAR: "car",
  TRAIN: "train",
  FLIGHT: "airplane",
  BUS: "bus",
  TREK: "hiking",
  CAMPING: "tent",
  BEACH: "beach",
  MOUNTAIN: "terrain",
  CYCLING: "bike",
  WATER_ADVENTURE: "kayaking",
  BACKPACKING: "bag-personal",
  WELLNESS: "spa",
  PHOTOGRAPHY: "camera",
  INTERNATIONAL: "earth",
  OTHER: "compass-outline",
};

// TRAVEL_MODE_LABELS carries a leading emoji for screens that still render
// plain text (e.g. "🚗 Car / Road trip"); strip it for icon-based UI.
export function travelModeText(mode: TravelMode): string {
  return TRAVEL_MODE_LABELS[mode].replace(/^\S+\s*/, "");
}
