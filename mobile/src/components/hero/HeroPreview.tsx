import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { HeroSettings, HeroSlide } from "../../api/hero";
import { FadeSwap, HeroBackdrop, HeroCopy, HeroDots, HeroTagline, useHeroCarousel } from "./HeroCarousel";

// The Discover hero as members will see it, built from the same pieces, for the
// admin dashboard. "mobile" draws a phone-width frame; "desktop" fills the space.
export function HeroPreview({
  slides,
  settings,
  variant,
  playing = true,
}: {
  slides: HeroSlide[];
  settings: HeroSettings;
  variant: "desktop" | "mobile";
  playing?: boolean;
}) {
  const desktop = variant === "desktop";
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useHeroCarousel(slides.length, settings.intervalSeconds, playing);
  const slide = slides[index];

  return (
    <View style={desktop ? styles.desktopWrap : styles.mobileWrap}>
      <View
        style={[styles.hero, desktop ? styles.heroDesktop : styles.heroMobile]}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        accessibilityLabel={`${desktop ? "Desktop" : "Mobile"} preview`}
      >
        {slide && width > 0 && <HeroBackdrop slides={slides} index={index} transition={settings.transition} width={width} animate />}
        {desktop && slide && (
          <FadeSwap id={slide.id} animate style={StyleSheet.absoluteFill}>
            <HeroTagline text={slide.tagline} color={slide.textColor} side="right" style={styles.taglineSmall} />
          </FadeSwap>
        )}
        <View style={styles.topRow}>
          <View style={styles.copy}>
            {slide ? (
              <FadeSwap id={slide.id} animate>
                <HeroCopy
                  slide={{ ...slide, heading: slide.heading ?? "Discover", subtitle: slide.subtitle ?? "Find trips and meet like-minded travelers." }}
                  desktop={desktop}
                  kicker={desktop ? undefined : "Hi, Traveler 👋"}
                />
              </FadeSwap>
            ) : (
              <Text style={styles.empty}>Upload media to see the preview</Text>
            )}
          </View>
          <View style={styles.actions}>
            <View style={styles.iconButton}>
              <MaterialCommunityIcons name="cog-outline" size={18} color="#0f172a" />
            </View>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>T</Text>
            </View>
          </View>
        </View>
        <View style={[styles.search, desktop && styles.searchDesktop]}>
          <MaterialCommunityIcons name="magnify" size={18} color="#64748b" />
          <Text style={styles.searchText}>Search trips, destinations...</Text>
        </View>
        <HeroDots count={slides.length} index={index} onSelect={setIndex} style={styles.dots} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  desktopWrap: { width: "100%" },
  mobileWrap: { width: 360, maxWidth: "100%", alignSelf: "center" },
  hero: { overflow: "hidden", backgroundColor: "#0c2b28", borderRadius: 20, paddingBottom: 26 },
  heroDesktop: { minHeight: 280, paddingTop: 28, paddingHorizontal: 28, paddingBottom: 40 },
  heroMobile: { minHeight: 230, paddingTop: 18, paddingHorizontal: 16 },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 },
  copy: { flex: 1, minWidth: 0 },
  empty: { color: "rgba(255,255,255,0.8)", fontSize: 14, marginTop: 30 },
  actions: { flexDirection: "row", alignItems: "center", gap: 10 },
  iconButton: { width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(255,255,255,0.92)", alignItems: "center", justifyContent: "center" },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#0f766e", borderWidth: 2, borderColor: "rgba(255,255,255,0.9)", alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#ffffff", fontWeight: "800" },
  search: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 18, backgroundColor: "#ffffff", borderRadius: 999, paddingHorizontal: 16, height: 44 },
  searchDesktop: { maxWidth: 420, marginTop: 22 },
  searchText: { color: "#94a3b8", fontSize: 14 },
  dots: { position: "absolute", bottom: 0, alignSelf: "center" },
  taglineSmall: { bottom: 24 },
});
