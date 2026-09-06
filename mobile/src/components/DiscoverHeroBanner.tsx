import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { COLORS, RADIUS } from "../theme/tokens";

const BANNER_HEIGHT = 150;
const ROUTE_DOTS = 7;

function loopTo1(value: Animated.Value, duration: number, delay = 0) {
  value.setValue(0);
  return Animated.loop(
    Animated.sequence([
      Animated.delay(delay),
      Animated.timing(value, { toValue: 1, duration, easing: Easing.linear, useNativeDriver: true }),
    ])
  );
}

// Hand-built looping map/location scene (no external GIF/video/Lottie asset -
// this repo has none, and fetching one from an unreviewed URL was explicitly
// ruled out). A dashed route with a traveling pulse, a plane gliding toward
// the destination, and a pin with pulsing radar rings - built entirely with
// RN's Animated API + icons, the same technique already proven cross-platform
// in ChatWallpaper/the prior HeroCarousel.
export function DiscoverHeroBanner() {
  const [width, setWidth] = useState(0);
  const dotWave = useRef(new Animated.Value(0)).current;
  const planeProgress = useRef(new Animated.Value(0)).current;
  const pinBounce = useRef(new Animated.Value(0)).current;
  const ring1 = useRef(new Animated.Value(0)).current;
  const ring2 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animations = [
      loopTo1(dotWave, 2200),
      loopTo1(planeProgress, 4200),
      Animated.loop(
        Animated.sequence([
          Animated.timing(pinBounce, { toValue: 1, duration: 700, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(pinBounce, { toValue: 0, duration: 700, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        ])
      ),
      loopTo1(ring1, 2000),
      loopTo1(ring2, 2000, 1000),
    ];
    animations.forEach((a) => a.start());
    return () => animations.forEach((a) => a.stop());
  }, [dotWave, planeProgress, pinBounce, ring1, ring2]);

  const pinTranslateY = pinBounce.interpolate({ inputRange: [0, 1], outputRange: [0, -6] });
  const planeTranslateX = useMemo(
    () => planeProgress.interpolate({ inputRange: [0, 1], outputRange: [-20, Math.max(80, width - 60)] }),
    [planeProgress, width]
  );
  const planeOpacity = planeProgress.interpolate({ inputRange: [0, 0.08, 0.85, 1], outputRange: [0, 1, 1, 0] });

  return (
    <View style={styles.wrap} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <View style={styles.routeRow} pointerEvents="none">
        {Array.from({ length: ROUTE_DOTS }).map((_, i) => {
          const phase = i / ROUTE_DOTS;
          const opacity = dotWave.interpolate({
            inputRange: [0, Math.max(0, phase - 0.15), phase, Math.min(1, phase + 0.15), 1],
            outputRange: [0.25, 0.25, 1, 0.25, 0.25],
          });
          return <Animated.View key={i} style={[styles.routeDot, { opacity }]} />;
        })}
      </View>

      {width > 0 && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.plane,
            { opacity: planeOpacity, transform: [{ translateX: planeTranslateX }, { rotate: "20deg" }] },
          ]}
        >
          <MaterialCommunityIcons name="airplane" size={20} color="rgba(255,255,255,0.85)" />
        </Animated.View>
      )}

      <View style={styles.pinWrap} pointerEvents="none">
        {[ring1, ring2].map((ring, i) => {
          const scale = ring.interpolate({ inputRange: [0, 1], outputRange: [0.4, 2.2] });
          const opacity = ring.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.5, 0] });
          return <Animated.View key={i} style={[styles.radarRing, { opacity, transform: [{ scale }] }]} />;
        })}
        <Animated.View style={{ transform: [{ translateY: pinTranslateY }] }}>
          <MaterialCommunityIcons name="map-marker" size={30} color={COLORS.white} />
        </Animated.View>
      </View>

      <LinearGradient
        colors={["rgba(29,78,216,0.45)", "rgba(15,118,110,0.45)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <LinearGradient
        colors={["transparent", "rgba(6,20,35,0.6)"]}
        style={styles.scrim}
        pointerEvents="none"
      />

      <Text style={styles.headline}>Your next adventure awaits ✈️</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    height: BANNER_HEIGHT,
    marginHorizontal: 16,
    marginTop: 14,
    borderRadius: RADIUS.card,
    overflow: "hidden",
    backgroundColor: "#0c2b28",
  },
  routeRow: {
    position: "absolute",
    left: 24,
    right: 70,
    top: BANNER_HEIGHT / 2 - 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  routeDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: COLORS.white },
  plane: { position: "absolute", left: 24, top: BANNER_HEIGHT / 2 - 24 },
  pinWrap: {
    position: "absolute",
    right: 40,
    top: BANNER_HEIGHT / 2 - 30,
    alignItems: "center",
    justifyContent: "center",
    width: 40,
    height: 60,
  },
  radarRing: {
    position: "absolute",
    top: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.white,
  },
  scrim: { position: "absolute", left: 0, right: 0, bottom: 0, height: "60%" },
  headline: {
    position: "absolute",
    left: 18,
    right: 18,
    bottom: 16,
    color: COLORS.white,
    fontSize: 17,
    fontWeight: "800",
  },
});
