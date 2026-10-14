import { useState } from "react";
import { Image, StyleSheet } from "react-native";
import type { HeroSlide } from "../../api/hero";
import { optimizedImageUrl } from "../../utils/optimizedImage";
import { HERO_PHOTO } from "../../utils/coverPhotos";

// Native: photos, and for videos their poster frame (no video player in the app yet).
// The web build (HeroMedia.web.tsx) plays the video itself.
export function HeroMedia({ slide, width }: { slide: HeroSlide; width: number; active: boolean; zoom: boolean }) {
  const [failed, setFailed] = useState(false);
  const url = slide.mediaType === "IMAGE" ? slide.mediaUrl : slide.posterUrl;
  const source = url && !failed ? { uri: optimizedImageUrl(url, Math.min(2400, Math.round(width * 2))) } : HERO_PHOTO;
  return <Image source={source} style={StyleSheet.absoluteFill} resizeMode="cover" onError={() => setFailed(true)} />;
}
