import { useEffect, useRef, useState, type ReactNode } from "react";
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { taglineLines, type HeroSlide, type HeroTransition } from "../../api/hero";
import { HeroMedia } from "./HeroMedia";

const TRANSITION_MS = 750;
const useNative = Platform.OS !== "web";

// Index of the slide on screen; advances every `intervalSeconds` while `playing`.
export function useHeroCarousel(count: number, intervalSeconds: number, playing: boolean) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (index >= count && count > 0) setIndex(0);
  }, [count, index]);
  useEffect(() => {
    if (!playing || count < 2) return;
    const t = setTimeout(() => setIndex((i) => (i + 1) % count), intervalSeconds * 1000);
    return () => clearTimeout(t);
  }, [playing, count, intervalSeconds, index]);
  return [count ? index % count : 0, setIndex] as const;
}

// The banner media behind the hero: the current slide over the previous one,
// crossfading or sliding in. Each slide carries its own darkening overlay.
export function HeroBackdrop({
  slides,
  index,
  transition,
  width,
  animate,
}: {
  slides: HeroSlide[];
  index: number;
  transition: HeroTransition;
  width: number;
  animate: boolean;
}) {
  const [shown, setShown] = useState({ current: index, previous: -1 });
  const progress = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (index === shown.current) return;
    setShown({ current: index, previous: shown.current });
    if (!animate) return progress.setValue(1);
    progress.setValue(0);
    Animated.timing(progress, { toValue: 1, duration: TRANSITION_MS, easing: Easing.out(Easing.cubic), useNativeDriver: useNative }).start(() =>
      setShown((s) => ({ ...s, previous: -1 }))
    );
  }, [index]); // eslint-disable-line react-hooks/exhaustive-deps

  const slide = (i: number, role: "current" | "previous") => {
    const s = slides[i];
    if (!s) return null;
    const style =
      transition === "slide"
        ? { transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: role === "current" ? [width, 0] : [0, -width] }) }] }
        : role === "current"
          ? { opacity: progress }
          : null;
    return (
      <Animated.View key={s.id} style={[StyleSheet.absoluteFill, style]} pointerEvents="none">
        <HeroMedia slide={s} width={width} active={role === "current"} zoom={animate} />
        <SlideShade slide={s} />
      </Animated.View>
    );
  };

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {shown.previous >= 0 && shown.previous !== shown.current && slide(shown.previous, "previous")}
      {slide(shown.current, "current")}
    </View>
  );
}

// Keeps text readable on any photo: the admin-chosen overlay, darker on the text's side.
function SlideShade({ slide }: { slide: HeroSlide }) {
  const a = slide.overlayOpacity;
  const strong = `rgba(8,20,40,${Math.min(0.9, a + 0.25)})`;
  const soft = `rgba(8,20,40,${a * 0.6})`;
  const dir =
    slide.textAlign === "RIGHT"
      ? { start: { x: 1, y: 0.5 }, end: { x: 0, y: 0.5 } }
      : slide.textAlign === "CENTER"
        ? { start: { x: 0.5, y: 1 }, end: { x: 0.5, y: 0 } }
        : { start: { x: 0, y: 0.5 }, end: { x: 1, y: 0.5 } };
  return (
    <>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(8,20,40,${a * 0.5})` }]} />
      <LinearGradient colors={[strong, soft, "rgba(8,20,40,0)"]} {...dir} style={StyleSheet.absoluteFill} />
    </>
  );
}

// Fades its children in again whenever `id` changes (the banner text on a new slide).
export function FadeSwap({ id, animate, children, style }: { id: string; animate: boolean; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const v = useRef(new Animated.Value(1)).current;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (!animate) return;
    v.setValue(0);
    Animated.timing(v, { toValue: 1, duration: 600, delay: 150, easing: Easing.out(Easing.cubic), useNativeDriver: useNative }).start();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Animated.View style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }]}>
      {children}
    </Animated.View>
  );
}

const ALIGN = { LEFT: "flex-start", CENTER: "center", RIGHT: "flex-end" } as const;
const TEXT_ALIGN = { LEFT: "left", CENTER: "center", RIGHT: "right" } as const;

// Heading, subtitle and button of a banner, in the hero's type styles.
export function HeroCopy({
  slide,
  desktop,
  kicker,
  onCta,
  headingStyle,
  subtitleStyle,
}: {
  slide: HeroSlide;
  desktop: boolean;
  kicker?: string;
  onCta?: () => void;
  headingStyle?: StyleProp<TextStyle>;
  subtitleStyle?: StyleProp<TextStyle>;
}) {
  const color = slide.textColor;
  const align = { alignItems: ALIGN[slide.textAlign] } as ViewStyle;
  const textAlign = { textAlign: TEXT_ALIGN[slide.textAlign] } as TextStyle;
  return (
    <View style={align}>
      {kicker ? <Text style={[styles.kicker, { color }, textAlign]}>{kicker}</Text> : null}
      {slide.heading ? (
        <Text style={[styles.heading, desktop && styles.headingDesktop, headingStyle, { color }, textAlign]} accessibilityRole="header" numberOfLines={2}>
          {slide.heading}
        </Text>
      ) : null}
      {slide.subtitle ? (
        <Text style={[styles.subtitle, subtitleStyle, { color }, textAlign]} numberOfLines={desktop ? 2 : 3}>
          {slide.subtitle}
        </Text>
      ) : null}
      {slide.ctaLabel && slide.ctaUrl ? (
        <Pressable
          onPress={onCta}
          style={(state) => [styles.cta, (state as { hovered?: boolean }).hovered && styles.ctaHover]}
          accessibilityRole={slide.ctaUrl.startsWith("https://") ? "link" : "button"}
        >
          <Text style={styles.ctaText}>{slide.ctaLabel}</Text>
          <MaterialCommunityIcons name={slide.ctaUrl.startsWith("https://") ? "open-in-new" : "arrow-right"} size={16} color="#0f172a" />
        </Pressable>
      ) : null}
    </View>
  );
}

// The slanted "Explore / Connect / Belong" lines, with a banner's own words. Kept at the
// bottom right whatever the text position: the search bar sits at the bottom left.
export function HeroTagline({ text, color, side, style }: { text: string | null; color: string; side: "left" | "right"; style?: StyleProp<ViewStyle> }) {
  const lines = taglineLines(text);
  if (!lines.length) return null;
  return (
    <View
      style={[styles.tagline, side === "left" ? styles.taglineLeft : styles.taglineRight, style]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
    >
      {lines.map((line) => (
        <Text key={line} style={[styles.taglineText, { color, textAlign: side }]} numberOfLines={1}>
          {line}
        </Text>
      ))}
    </View>
  );
}

// Page dots; each one jumps to its slide.
export function HeroDots({ count, index, onSelect, style }: { count: number; index: number; onSelect: (i: number) => void; style?: StyleProp<ViewStyle> }) {
  if (count < 2) return null;
  return (
    <View style={[styles.dots, style]} accessibilityRole="tablist">
      {Array.from({ length: count }, (_, i) => (
        <Pressable
          key={i}
          onPress={() => onSelect(i)}
          style={styles.dotHit}
          accessibilityRole="tab"
          accessibilityState={{ selected: i === index }}
          accessibilityLabel={`Banner ${i + 1} of ${count}`}
        >
          <View style={[styles.dot, i === index && styles.dotActive]} />
        </Pressable>
      ))}
    </View>
  );
}

const shadow = { textShadowColor: "rgba(0,0,0,0.35)", textShadowRadius: 10, textShadowOffset: { width: 0, height: 1 } };

const styles = StyleSheet.create({
  kicker: { fontSize: 14, fontWeight: "600", marginBottom: 2, opacity: 0.92, ...shadow },
  heading: { fontSize: 30, fontWeight: "800", letterSpacing: -0.5, ...shadow },
  headingDesktop: { fontSize: 42 },
  subtitle: { fontSize: 14, marginTop: 6, lineHeight: 20, maxWidth: 560, opacity: 0.94, ...shadow },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 14,
    height: 40,
    paddingHorizontal: 18,
    borderRadius: 999,
    backgroundColor: "#ffffff",
    shadowColor: "#0f172a",
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  ctaHover: { transform: [{ translateY: -1 }] },
  ctaText: { color: "#0f172a", fontSize: 14, fontWeight: "800" },
  tagline: { position: "absolute", bottom: 28, transform: [{ rotate: "-8deg" }] },
  taglineRight: { right: 40, alignItems: "flex-end" },
  taglineLeft: { left: 40, alignItems: "flex-start" },
  taglineText: { fontSize: 26, lineHeight: 30, fontStyle: "italic", fontWeight: "600", maxWidth: 320, ...shadow },
  dots: { flexDirection: "row", gap: 2 },
  dotHit: { paddingVertical: 10, paddingHorizontal: 4 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.5)" },
  dotActive: { width: 22, backgroundColor: "#ffffff" },
});
