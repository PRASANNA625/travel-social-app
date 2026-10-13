import { Image, type ImageSourcePropType } from "react-native";
import type { TravelMode } from "../types";

// Bundled CC0 photos (see assets/covers/CREDITS.md). Trips without an uploaded
// cover show a photo matching their travel type instead of a blank placeholder.
export const HERO_PHOTO: ImageSourcePropType = require("../../assets/covers/hero.jpg");
export const HERO_PHOTO_ASPECT = 2172 / 724;

const P = {
  alpineLake: require("../../assets/covers/alpine_lake.jpg"),
  backpacking: require("../../assets/covers/backpacking.jpg"),
  bali: require("../../assets/covers/bali.jpg"),
  bay: require("../../assets/covers/bay.jpg"),
  beachHuts: require("../../assets/covers/beach_huts.jpg"),
  bike: require("../../assets/covers/bike.jpg"),
  bus: require("../../assets/covers/bus.jpg"),
  camping: require("../../assets/covers/camping.jpg"),
  car: require("../../assets/covers/car.jpg"),
  cycling: require("../../assets/covers/cycling.jpg"),
  flight: require("../../assets/covers/flight.jpg"),
  greenValley: require("../../assets/covers/green_valley.jpg"),
  hikerRock: require("../../assets/covers/hiker_rock.jpg"),
  himalaya: require("../../assets/covers/himalaya.jpg"),
  houseboat: require("../../assets/covers/houseboat.jpg"),
  palmBeach: require("../../assets/covers/palm_beach.jpg"),
  peaks: require("../../assets/covers/peaks.jpg"),
  photography: require("../../assets/covers/photography.jpg"),
  roadAlt: require("../../assets/covers/road_alt.jpg"),
  snowPeak: require("../../assets/covers/snow_peak.jpg"),
  tea: require("../../assets/covers/tea.jpg"),
  tent: require("../../assets/covers/tent.jpg"),
  train: require("../../assets/covers/train.jpg"),
  trek: require("../../assets/covers/trek.jpg"),
  water: require("../../assets/covers/water.jpg"),
  wellness: require("../../assets/covers/wellness.jpg"),
} satisfies Record<string, ImageSourcePropType>;

// Several related photos per type so a list of same-type trips doesn't repeat one image.
const TRAVEL_MODE_COVERS: Record<TravelMode, ImageSourcePropType[]> = {
  BIKE: [P.himalaya, P.bike, P.roadAlt],
  CAR: [P.himalaya, P.car, P.roadAlt],
  TRAIN: [P.train, P.tea, P.greenValley],
  FLIGHT: [P.bali, P.flight],
  BUS: [P.bus, P.himalaya],
  TREK: [P.hikerRock, P.greenValley, P.tea, P.alpineLake, P.trek, P.snowPeak],
  CAMPING: [P.tent, P.camping, P.alpineLake],
  BEACH: [P.palmBeach, P.beachHuts, P.bay],
  MOUNTAIN: [P.snowPeak, P.alpineLake, P.peaks, P.himalaya],
  CYCLING: [P.cycling, P.roadAlt, P.greenValley],
  WATER_ADVENTURE: [P.bay, P.water, P.houseboat],
  BACKPACKING: [P.hikerRock, P.backpacking, P.greenValley],
  WELLNESS: [P.houseboat, P.tea, P.wellness],
  PHOTOGRAPHY: [P.alpineLake, P.photography, P.snowPeak],
  INTERNATIONAL: [P.bali, P.beachHuts, P.flight],
  OTHER: [P.greenValley, P.alpineLake, P.tea],
};

// Stable per trip: the same trip always gets the same photo.
export function fallbackCover(trip: { id: string; travelMode: TravelMode }): ImageSourcePropType {
  const options = TRAVEL_MODE_COVERS[trip.travelMode] ?? TRAVEL_MODE_COVERS.OTHER;
  let hash = 0;
  for (let i = 0; i < trip.id.length; i++) hash = (hash * 31 + trip.id.charCodeAt(i)) | 0;
  return options[Math.abs(hash) % options.length];
}

// Uploads this small are placeholders (e.g. a 1x1 test image), not real covers.
const MIN_COVER_PIXELS = 32;

// Calls onPlaceholder when an uploaded cover turns out too small to be a real photo.
export function checkPlaceholderCover(uri: string | undefined, onPlaceholder: () => void) {
  if (!uri) return;
  Image.getSize(
    uri,
    (width) => {
      if (width > 0 && width < MIN_COVER_PIXELS) onPlaceholder();
    },
    () => {}
  );
}
