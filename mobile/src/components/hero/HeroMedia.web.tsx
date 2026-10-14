import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Image, StyleSheet } from "react-native";
import type { HeroSlide } from "../../api/hero";
import { optimizedImageUrl, optimizedVideoUrl } from "../../utils/optimizedImage";
import { HERO_PHOTO } from "../../utils/coverPhotos";

// Web sibling of HeroMedia.tsx: a real <img>/<video> so the media can be cropped
// around its focal point (object-position), and videos autoplay muted and loop.

const fill: CSSProperties = { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", display: "block" };

function prefersStill() {
  if (typeof window === "undefined") return true;
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
  return !!(reduce || saveData);
}


export function HeroMedia({ slide, width, active, zoom }: { slide: HeroSlide; width: number; active: boolean; zoom: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);
  const [stillFailed, setStillFailed] = useState(false);
  const dpr = typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 1;
  // Phones get a smaller rendition; never request more than 2400px.
  const px = Math.min(2400, Math.max(640, Math.round(width * dpr)));
  const still = prefersStill();
  const position = slide.focalPoint;

  // Only the visible slide plays; others pause so phones don't decode several videos.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (active && !still) v.play().catch(() => {});
    else v.pause();
  }, [active, still]);

  // Slow "Ken Burns" drift on photos while the slide is shown.
  const motion: CSSProperties = zoom && !still ? { transform: active ? "scale(1.06)" : "scale(1)", transition: "transform 9s ease-out" } : {};
  const poster = slide.posterUrl ? optimizedImageUrl(slide.posterUrl, px) : undefined;

  if (slide.mediaType === "VIDEO" && !failed && !still) {
    return (
      <video
        ref={videoRef}
        src={optimizedVideoUrl(slide.mediaUrl, Math.min(px, 1920))}
        poster={poster}
        muted
        loop
        playsInline
        autoPlay={active}
        preload={active ? "auto" : "metadata"}
        aria-hidden
        onError={() => setFailed(true)}
        style={{ ...fill, objectPosition: position }}
      />
    );
  }

  // Images, plus videos that can't or shouldn't play (show their poster, else the default scene).
  const src = stillFailed ? undefined : slide.mediaType === "IMAGE" && !failed ? optimizedImageUrl(slide.mediaUrl, px) : poster;
  // Nothing usable: the bundled default scene.
  if (!src) return <Image source={HERO_PHOTO} style={StyleSheet.absoluteFill} resizeMode="cover" />;
  return (
    <img
      src={src}
      alt=""
      aria-hidden
      decoding="async"
      // A failed photo falls back to the poster (videos) or the default scene.
      onError={() => (slide.mediaType === "IMAGE" && !failed && poster ? setFailed(true) : setStillFailed(true))}
      style={{ ...fill, objectPosition: position, ...motion }}
    />
  );
}
