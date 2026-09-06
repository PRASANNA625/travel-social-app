import type { ComponentProps } from "react";
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  FlatList,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useIsFocused } from "@react-navigation/native";
import { COLORS, RADIUS } from "../theme/tokens";

type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

interface Slide {
  icon: IconName;
  title: string;
  colors: readonly [string, string, string];
}

// Illustrated slides (gradient + icon), not photos: this app has no bundled
// travel photography, and hotlinking external stock images would add an
// unreviewed third-party dependency. Reuses the same watermark-icon-over-
// gradient language as GradientBackground/ChatWallpaper for consistency.
const SLIDES: Slide[] = [
  { icon: "image-filter-hdr", title: "Your next adventure awaits", colors: ["#1d4ed8", "#0f766e", "#0c2b28"] },
  { icon: "account-group", title: "Find your travel crew", colors: ["#0f766e", "#1d4ed8", "#0c2b28"] },
  { icon: "compass-outline", title: "Explore. Connect. Travel.", colors: ["#0c2b28", "#1d4ed8", "#0f766e"] },
  { icon: "car-side", title: "Road trips, made social", colors: ["#1d4ed8", "#0c2b28", "#0f766e"] },
];

const AUTO_ADVANCE_MS = 3500;
const CAROUSEL_HEIGHT = 150;

export function HeroCarousel() {
  const [width, setWidth] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<FlatList<Slide>>(null);
  const activeIndexRef = useRef(0);
  const zoom = useRef(new Animated.Value(1)).current;
  const isFocused = useIsFocused();

  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);

  // Gentle Ken Burns zoom on the active slide, restarted on every slide change.
  useEffect(() => {
    zoom.setValue(1);
    Animated.timing(zoom, {
      toValue: 1.08,
      duration: AUTO_ADVANCE_MS + 400,
      useNativeDriver: true,
    }).start();
  }, [activeIndex, zoom]);

  // Auto-advance only while this screen is actually focused, so it doesn't
  // keep animating/scrolling in the background on another tab.
  useEffect(() => {
    if (!isFocused || width === 0) return;
    const timer = setInterval(() => {
      const next = (activeIndexRef.current + 1) % SLIDES.length;
      listRef.current?.scrollToOffset({ offset: next * width, animated: true });
      setActiveIndex(next);
    }, AUTO_ADVANCE_MS);
    return () => clearInterval(timer);
  }, [isFocused, width]);

  const onMomentumScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (width === 0) return;
    setActiveIndex(Math.round(e.nativeEvent.contentOffset.x / width));
  };

  return (
    <View style={styles.wrap} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 && (
        <FlatList
          ref={listRef}
          data={SLIDES}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => item.title}
          onMomentumScrollEnd={onMomentumScrollEnd}
          renderItem={({ item }) => (
            <View style={{ width, height: CAROUSEL_HEIGHT }}>
              <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ scale: zoom }] }]}>
                <LinearGradient
                  colors={item.colors}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                >
                  <MaterialCommunityIcons
                    name={item.icon}
                    size={120}
                    color="rgba(255,255,255,0.14)"
                    style={styles.slideIcon}
                  />
                </LinearGradient>
              </Animated.View>
              <LinearGradient colors={["transparent", "rgba(6,20,35,0.55)"]} style={styles.scrim} />
              <Text style={styles.slideTitle}>{item.title}</Text>
            </View>
          )}
        />
      )}
      <View style={styles.dotsRow} pointerEvents="none">
        {SLIDES.map((_, i) => (
          <View key={i} style={[styles.dot, i === activeIndex && styles.dotActive]} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    height: CAROUSEL_HEIGHT,
    marginHorizontal: 16,
    marginTop: 14,
    borderRadius: RADIUS.card,
    overflow: "hidden",
    backgroundColor: COLORS.primary,
  },
  slideIcon: { position: "absolute", right: -10, bottom: -14, transform: [{ rotate: "-10deg" }] },
  scrim: { position: "absolute", left: 0, right: 0, bottom: 0, height: "65%" },
  slideTitle: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 14,
    color: COLORS.white,
    fontSize: 16,
    fontWeight: "700",
  },
  dotsRow: {
    position: "absolute",
    bottom: 8,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    gap: 5,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.45)" },
  dotActive: { width: 14, backgroundColor: COLORS.white },
});
