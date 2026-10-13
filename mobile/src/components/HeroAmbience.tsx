import { Animated, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useLoop, usePingPong } from "../hooks/useReduceMotion";

// Light animated layers over the Discover hero photo: drifting clouds in the sky,
// a slow shimmer across the lake and a pair of birds. Purely decorative: it never
// takes touches, and with `animate` off everything rests in place.
export function HeroAmbience({ width, height, animate }: { width: number; height: number; animate: boolean }) {
  if (width === 0 || height === 0) return null;
  // The lake fills roughly the bottom fifth of the photo.
  const lakeHeight = Math.round(height * 0.24);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Cloud width={width} top={height * 0.06} size={1} duration={95000} delay={0} animate={animate} restAt={0.62} />
      <Cloud width={width} top={height * 0.2} size={0.7} duration={120000} delay={18000} animate={animate} restAt={0.3} />
      <Lake width={width} height={lakeHeight} animate={animate} />
      <Birds width={width} height={height} animate={animate} />
    </View>
  );
}

function Cloud({
  width,
  top,
  size,
  duration,
  delay,
  animate,
  restAt,
}: {
  width: number;
  top: number;
  size: number;
  duration: number;
  delay: number;
  animate: boolean;
  restAt: number;
}) {
  const t = useLoop(duration, delay, animate, restAt);
  const translateX = t.interpolate({ inputRange: [0, 1], outputRange: [-220 * size, width + 20] });
  const opacity = t.interpolate({ inputRange: [0, 0.08, 0.92, 1], outputRange: [0, 1, 1, 0] });
  return (
    <Animated.View style={[styles.cloud, { top, opacity, transform: [{ translateX }, { scale: size }] }]}>
      <View style={[styles.puff, { width: 150, height: 34, left: 0, top: 22 }]} />
      <View style={[styles.puff, { width: 80, height: 50, left: 30, top: 4 }]} />
      <View style={[styles.puff, { width: 64, height: 40, left: 84, top: 12 }]} />
    </Animated.View>
  );
}

function Lake({ width, height, animate }: { width: number; height: number; animate: boolean }) {
  // A soft band of light sweeping across the water, plus a few ripple lines that breathe.
  const sweep = useLoop(14000, 2500, animate, 0.35);
  const breathe = usePingPong(3200, animate);
  const bandWidth = Math.max(180, width * 0.35);
  const translateX = sweep.interpolate({ inputRange: [0, 1], outputRange: [-bandWidth, width] });
  const rippleOpacity = breathe.interpolate({ inputRange: [0, 1], outputRange: [0.08, 0.28] });
  const rippleShift = breathe.interpolate({ inputRange: [0, 1], outputRange: [-6, 6] });

  return (
    <View style={[styles.lake, { height }]}>
      <Animated.View style={[styles.shimmer, { width: bandWidth, transform: [{ translateX }] }]}>
        <LinearGradient
          colors={["rgba(255,255,255,0)", "rgba(255,255,255,0.16)", "rgba(255,255,255,0)"]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      {RIPPLES.map((r, i) => (
        <Animated.View
          key={i}
          style={[
            styles.ripple,
            {
              left: `${r.x}%`,
              top: `${r.y}%`,
              width: r.w,
              opacity: rippleOpacity,
              transform: [{ translateX: i % 2 === 0 ? rippleShift : Animated.multiply(rippleShift, -1) }],
            },
          ]}
        />
      ))}
    </View>
  );
}

const RIPPLES = [
  { x: 18, y: 35, w: 46 },
  { x: 41, y: 62, w: 64 },
  { x: 62, y: 30, w: 38 },
  { x: 74, y: 70, w: 54 },
  { x: 30, y: 82, w: 34 },
];

function Birds({ width, height, animate }: { width: number; height: number; animate: boolean }) {
  // Glide right to left across the upper sky every ~40s, bobbing gently.
  const t = useLoop(38000, 6000, animate, 0.4);
  const bob = usePingPong(1800, animate);
  const translateX = t.interpolate({ inputRange: [0, 1], outputRange: [width + 30, -60] });
  const translateY = bob.interpolate({ inputRange: [0, 1], outputRange: [-3, 3] });
  const opacity = t.interpolate({ inputRange: [0, 0.05, 0.95, 1], outputRange: [0, 1, 1, 0] });
  return (
    <Animated.View style={[styles.birds, { top: height * 0.14, opacity, transform: [{ translateX }, { translateY }] }]}>
      <MaterialCommunityIcons name="bird" size={16} color="rgba(15,23,42,0.55)" />
      <MaterialCommunityIcons name="bird" size={12} color="rgba(15,23,42,0.45)" style={styles.birdSecond} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  cloud: { position: "absolute", left: 0, width: 150, height: 56 },
  puff: { position: "absolute", borderRadius: 40, backgroundColor: "rgba(255,255,255,0.32)" },
  lake: { position: "absolute", left: 0, right: 0, bottom: 0, overflow: "hidden" },
  shimmer: { position: "absolute", top: 0, bottom: 0, left: 0 },
  ripple: { position: "absolute", height: 1.5, borderRadius: 1, backgroundColor: "rgba(255,255,255,0.9)" },
  birds: { position: "absolute", left: 0, flexDirection: "row", alignItems: "flex-start" },
  birdSecond: { marginLeft: 6, marginTop: 8 },
});
