import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
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

const CAROUSEL_HEIGHT = 150;
const AUTO_ADVANCE_MS = 3800;

// Hand-built looping animated scenes (RN Animated API) rather than bundled
// GIF/Lottie/MP4 assets - this repo has no travel footage or licensed
// animation files, and fetching one from an unreviewed external URL was
// explicitly ruled out. Each scene loops continuously only while its slide
// is the active one, matching the "pause when not visible" requirement.
function useLoop(active: boolean, duration: number, delay = 0) {
  const value = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active) return;
    value.setValue(0);
    const anim = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(value, { toValue: 1, duration, easing: Easing.linear, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [active, delay, duration, value]);
  return value;
}

function usePulse(active: boolean, duration: number) {
  const value = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active) return;
    value.setValue(0);
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(value, { toValue: 1, duration: duration / 2, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(value, { toValue: 0, duration: duration / 2, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [active, duration, value]);
  return value;
}

interface SceneProps {
  active: boolean;
  width: number;
}

function RoadTripScene({ active, width }: SceneProps) {
  const drive = useLoop(active, 3600);
  const bounce = usePulse(active, 500);
  const translateX = drive.interpolate({ inputRange: [0, 1], outputRange: [-30, Math.max(60, width - 50)] });
  const translateY = bounce.interpolate({ inputRange: [0, 1], outputRange: [0, -3] });
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={styles.roadLine} />
      <Animated.View style={[styles.carWrap, { transform: [{ translateX }, { translateY }] }]}>
        <MaterialCommunityIcons name="car-side" size={26} color={COLORS.white} />
      </Animated.View>
    </View>
  );
}

function FlightScene({ active, width }: SceneProps) {
  const dotWave = useLoop(active, 2200);
  const planeProgress = useLoop(active, 4200);
  const translateX = planeProgress.interpolate({ inputRange: [0, 1], outputRange: [-20, Math.max(80, width - 60)] });
  const opacity = planeProgress.interpolate({ inputRange: [0, 0.08, 0.85, 1], outputRange: [0, 1, 1, 0] });
  const dots = Array.from({ length: 7 });
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={styles.routeRow}>
        {dots.map((_, i) => {
          const phase = i / dots.length;
          const dotOpacity = dotWave.interpolate({
            inputRange: [0, Math.max(0, phase - 0.15), phase, Math.min(1, phase + 0.15), 1],
            outputRange: [0.25, 0.25, 1, 0.25, 0.25],
          });
          return <Animated.View key={i} style={[styles.routeDot, { opacity: dotOpacity }]} />;
        })}
      </View>
      <Animated.View style={[styles.plane, { opacity, transform: [{ translateX }, { rotate: "20deg" }] }]}>
        <MaterialCommunityIcons name="airplane" size={22} color={COLORS.white} />
      </Animated.View>
    </View>
  );
}

function MountainScene({ active, width }: SceneProps) {
  const cloudDrift = useLoop(active, 5000);
  const sunPulse = usePulse(active, 1800);
  const cloudX = cloudDrift.interpolate({ inputRange: [0, 1], outputRange: [-20, Math.max(70, width - 40)] });
  const sunScale = sunPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.15] });
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View style={[styles.sun, { transform: [{ scale: sunScale }] }]}>
        <MaterialCommunityIcons name="weather-sunny" size={22} color="rgba(255,255,255,0.85)" />
      </Animated.View>
      <Animated.View style={[styles.cloud, { transform: [{ translateX: cloudX }] }]}>
        <MaterialCommunityIcons name="cloud-outline" size={20} color="rgba(255,255,255,0.55)" />
      </Animated.View>
      <MaterialCommunityIcons name="terrain" size={100} color="rgba(255,255,255,0.16)" style={styles.terrain} />
    </View>
  );
}

function ExploreScene({ active }: SceneProps) {
  const spin = useLoop(active, 6000);
  const bounce = usePulse(active, 700);
  const ring1 = useLoop(active, 2000);
  const ring2 = useLoop(active, 2000, 1000);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  const translateY = bounce.interpolate({ inputRange: [0, 1], outputRange: [0, -6] });
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View style={[styles.compass, { transform: [{ rotate }] }]}>
        <MaterialCommunityIcons name="compass-outline" size={26} color="rgba(255,255,255,0.55)" />
      </Animated.View>
      <View style={styles.pinWrap}>
        {[ring1, ring2].map((ring, i) => {
          const scale = ring.interpolate({ inputRange: [0, 1], outputRange: [0.4, 2.2] });
          const opacity = ring.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.5, 0] });
          return <Animated.View key={i} style={[styles.radarRing, { opacity, transform: [{ scale }] }]} />;
        })}
        <Animated.View style={{ transform: [{ translateY }] }}>
          <MaterialCommunityIcons name="map-marker" size={28} color={COLORS.white} />
        </Animated.View>
      </View>
    </View>
  );
}

function BeachScene({ active, width }: SceneProps) {
  const sway = usePulse(active, 1600);
  const waveShift = useLoop(active, 3200);
  const rotate = sway.interpolate({ inputRange: [0, 1], outputRange: ["-6deg", "6deg"] });
  const waveX = waveShift.interpolate({ inputRange: [0, 1], outputRange: [0, -24] });
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View style={[styles.palmTree, { transform: [{ rotate }] }]}>
        <MaterialCommunityIcons name="palm-tree" size={30} color="rgba(255,255,255,0.85)" />
      </Animated.View>
      <MaterialCommunityIcons name="weather-sunny" size={20} color="rgba(255,255,255,0.6)" style={styles.beachSun} />
      <Animated.View style={[styles.waveRow, { width: width + 48, transform: [{ translateX: waveX }] }]}>
        {Array.from({ length: 8 }).map((_, i) => (
          <MaterialCommunityIcons key={i} name="waves" size={18} color="rgba(255,255,255,0.35)" />
        ))}
      </Animated.View>
    </View>
  );
}

interface Slide {
  key: string;
  title: string;
  colors: readonly [string, string, string];
  Scene: (props: SceneProps) => React.JSX.Element;
}

const SLIDES: Slide[] = [
  { key: "explore", title: "Your next adventure awaits ✈️", colors: ["#1d4ed8", "#0f766e", "#0c2b28"], Scene: ExploreScene },
  { key: "road", title: "Road trips, made social", colors: ["#0f766e", "#1d4ed8", "#0c2b28"], Scene: RoadTripScene },
  { key: "flight", title: "Fly further, together", colors: ["#0c2b28", "#1d4ed8", "#0f766e"], Scene: FlightScene },
  { key: "mountain", title: "Chase the mountain views", colors: ["#1d4ed8", "#0c2b28", "#0f766e"], Scene: MountainScene },
  { key: "beach", title: "Sun, sand, new friends", colors: ["#0f766e", "#0c2b28", "#1d4ed8"], Scene: BeachScene },
];

export function DiscoverHeroCarousel() {
  const [width, setWidth] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<FlatList<Slide>>(null);
  const activeIndexRef = useRef(0);
  const isFocused = useIsFocused();

  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);

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
          keyExtractor={(item) => item.key}
          onMomentumScrollEnd={onMomentumScrollEnd}
          renderItem={({ item, index }) => (
            <View style={{ width, height: CAROUSEL_HEIGHT }}>
              <LinearGradient colors={item.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
              <item.Scene active={isFocused && activeIndex === index} width={width} />
              <LinearGradient colors={["transparent", "rgba(6,20,35,0.55)"]} style={styles.scrim} pointerEvents="none" />
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
    backgroundColor: "#0c2b28",
  },
  scrim: { position: "absolute", left: 0, right: 0, bottom: 0, height: "65%" },
  slideTitle: { position: "absolute", left: 16, right: 16, bottom: 14, color: COLORS.white, fontSize: 16, fontWeight: "700" },
  dotsRow: { position: "absolute", bottom: 8, left: 0, right: 0, flexDirection: "row", justifyContent: "center", gap: 5 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.45)" },
  dotActive: { width: 14, backgroundColor: COLORS.white },

  roadLine: { position: "absolute", left: 0, right: 0, bottom: 44, height: 3, backgroundColor: "rgba(255,255,255,0.35)" },
  carWrap: { position: "absolute", bottom: 48 },

  routeRow: { position: "absolute", left: 24, right: 70, top: CAROUSEL_HEIGHT / 2 - 22, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  routeDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: COLORS.white },
  plane: { position: "absolute", left: 24, top: CAROUSEL_HEIGHT / 2 - 46 },

  sun: { position: "absolute", right: 22, top: 16 },
  cloud: { position: "absolute", top: 22 },
  terrain: { position: "absolute", left: -10, bottom: -20 },

  compass: { position: "absolute", left: 20, top: 18 },
  pinWrap: { position: "absolute", right: 40, top: CAROUSEL_HEIGHT / 2 - 30, alignItems: "center", justifyContent: "center", width: 40, height: 60 },
  radarRing: { position: "absolute", top: 6, width: 24, height: 24, borderRadius: 12, backgroundColor: COLORS.white },

  palmTree: { position: "absolute", left: 18, bottom: 40 },
  beachSun: { position: "absolute", right: 24, top: 16 },
  waveRow: { position: "absolute", bottom: 42, flexDirection: "row", justifyContent: "space-between" },
});
