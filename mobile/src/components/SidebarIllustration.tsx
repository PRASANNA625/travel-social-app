import { useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Image, Platform, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { SIDEBAR_WIDTH } from "../theme/layout";

// Bottom-of-sidebar travel scene: a static illustration (assets/sidebar-scene.png)
// with lightweight Animated layers on top. Loops use the native driver where it
// exists (transform/opacity only) and stop entirely when the OS asks to reduce motion.
export const ILLUSTRATION_SCENE_HEIGHT = 200;
export const ILLUSTRATION_TEXT_HEIGHT = 92;

const useNativeDriver = Platform.OS !== "web";
const SNOWFLAKES = 14;

function useReduceMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduce).catch(() => {});
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduce);
    return () => sub.remove();
  }, []);
  return reduce;
}

// 0 -> 1 forever, after an initial delay; static at `restAt` when motion is reduced.
function useLoop(duration: number, delay: number, enabled: boolean, restAt = 0.5) {
  const value = useRef(new Animated.Value(enabled ? 0 : restAt)).current;
  useEffect(() => {
    if (!enabled) {
      value.setValue(restAt);
      return;
    }
    value.setValue(0);
    const anim = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(value, { toValue: 1, duration, easing: Easing.linear, useNativeDriver }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [value, duration, delay, enabled, restAt]);
  return value;
}

function Cloud({ top, scale, duration, delay, animate, restX }: {
  top: number; scale: number; duration: number; delay: number; animate: boolean; restX: number;
}) {
  const t = useLoop(duration, delay, animate, restX);
  const translateX = t.interpolate({ inputRange: [0, 1], outputRange: [-70, SIDEBAR_WIDTH + 20] });
  return (
    <Animated.View style={[styles.cloud, { top, transform: [{ translateX }, { scale }] }]} pointerEvents="none">
      <View style={[styles.puff, { width: 34, height: 16, left: 0, top: 8 }]} />
      <View style={[styles.puff, { width: 24, height: 22, left: 9, top: 0 }]} />
      <View style={[styles.puff, { width: 20, height: 16, left: 22, top: 5 }]} />
    </Animated.View>
  );
}

function Snowflake({ index, animate }: { index: number; animate: boolean }) {
  // Deterministic spread so flakes don't clump (no Math.random on every render).
  const x = ((index * 61) % (SIDEBAR_WIDTH - 12)) + 6;
  const size = 3 + (index % 3);
  const duration = 5200 + ((index * 733) % 3800);
  const delay = (index * 457) % 4200;
  const t = useLoop(duration, delay, animate, ((index * 37) % 100) / 100);
  const translateY = t.interpolate({ inputRange: [0, 1], outputRange: [-8, ILLUSTRATION_SCENE_HEIGHT - 30] });
  const translateX = t.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [0, 5, 0, -5, 0] });
  const opacity = t.interpolate({ inputRange: [0, 0.1, 0.85, 1], outputRange: [0, 1, 1, 0] });
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.flake,
        { left: x, width: size, height: size, borderRadius: size / 2, opacity: animate ? opacity : 0.8, transform: [{ translateX }, { translateY }] },
      ]}
    />
  );
}

function Airplane({ animate }: { animate: boolean }) {
  const t = useLoop(9000, 7000, animate, 0.62);
  const translateX = t.interpolate({ inputRange: [0, 1], outputRange: [-30, SIDEBAR_WIDTH + 10] });
  const translateY = t.interpolate({ inputRange: [0, 1], outputRange: [78, 18] });
  const opacity = t.interpolate({ inputRange: [0, 0.08, 0.9, 1], outputRange: [0, 1, 1, 0] });
  return (
    <Animated.View style={[styles.plane, { opacity, transform: [{ translateX }, { translateY }, { rotate: "-14deg" }] }]} pointerEvents="none">
      <MaterialCommunityIcons name="airplane" size={18} color="#3b82f6" />
    </Animated.View>
  );
}

function Bird({ left, top, duration, delay, animate }: {
  left: number; top: number; duration: number; delay: number; animate: boolean;
}) {
  const t = useLoop(duration, delay, animate);
  const translateY = t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, -4, 0] });
  const translateX = t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 6, 0] });
  return (
    <Animated.View style={[styles.bird, { left, top, transform: [{ translateX }, { translateY }] }]} pointerEvents="none">
      <MaterialCommunityIcons name="bird" size={12} color="#64748b" />
    </Animated.View>
  );
}

export function SidebarIllustration({ showScene, dimmed }: { showScene: boolean; dimmed?: boolean }) {
  const reduceMotion = useReduceMotion();
  const animate = !reduceMotion;
  const intro = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  const planeBob = useLoop(2400, 0, animate);

  useEffect(() => {
    if (reduceMotion) {
      intro.setValue(1);
      return;
    }
    Animated.timing(intro, { toValue: 1, duration: 900, delay: 300, easing: Easing.out(Easing.cubic), useNativeDriver }).start();
  }, [intro, reduceMotion]);

  const flakes = useMemo(() => Array.from({ length: SNOWFLAKES }, (_, i) => i), []);
  const textShift = intro.interpolate({ inputRange: [0, 1], outputRange: [10, 0] });
  const bob = planeBob.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, -3, 0] });

  return (
    <View style={[styles.wrap, dimmed && styles.dimmed]} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {showScene && (
        <View style={styles.scene}>
          <Cloud top={18} scale={1} duration={26000} delay={0} animate={animate} restX={0.3} />
          <Cloud top={52} scale={0.75} duration={34000} delay={9000} animate={animate} restX={0.75} />
          <Bird left={150} top={36} duration={2600} delay={0} animate={animate} />
          <Bird left={170} top={46} duration={3100} delay={400} animate={animate} />
          <Airplane animate={animate} />
          <Image source={require("../../assets/sidebar-scene.png")} style={styles.sceneImage} resizeMode="cover" />
          {flakes.map((i) => (
            <Snowflake key={i} index={i} animate={animate} />
          ))}
        </View>
      )}
      <Animated.View
        style={[styles.textBlock, showScene && !dimmed && styles.textOnSnow, { opacity: intro, transform: [{ translateY: textShift }] }]}
      >
        <Animated.View style={{ transform: [{ translateY: bob }] }}>
          <MaterialCommunityIcons name="map-marker-path" size={22} color="#3b82f6" />
        </Animated.View>
        <Text style={styles.text}>
          New journeys bring new people and stories{" "}
          <MaterialCommunityIcons name="airplane" size={15} color="#2563eb" />
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({

  wrap: { width: SIDEBAR_WIDTH, alignItems: "center" },
  dimmed: { opacity: 0.45 },
  scene: { width: SIDEBAR_WIDTH, height: ILLUSTRATION_SCENE_HEIGHT, overflow: "hidden" },
  sceneImage: { position: "absolute", left: 0, right: 0, bottom: 0, width: SIDEBAR_WIDTH, height: ILLUSTRATION_SCENE_HEIGHT },
  cloud: { position: "absolute", left: 0, width: 46, height: 24 },
  puff: { position: "absolute", backgroundColor: "#ffffff", borderRadius: 12, opacity: 0.95 },
  flake: {
    position: "absolute",
    top: 0,
    backgroundColor: "#ffffff",
    borderWidth: 0.5,
    borderColor: "rgba(96,165,250,0.45)",
  },
  plane: { position: "absolute", left: 0, top: 0 },
  bird: { position: "absolute" },
  textBlock: {
    width: SIDEBAR_WIDTH,
    height: ILLUSTRATION_TEXT_HEIGHT,
    alignItems: "center",
    justifyContent: "flex-start",
    paddingHorizontal: 22,
    paddingTop: 4,
    paddingBottom: 14,
    gap: 4,
  },
  // Same white as the scene's snowy ground, so the tagline sits on the snow.
  textOnSnow: { backgroundColor: "#f7fafe" },
  text: { fontSize: 14.5, lineHeight: 20, color: "#475569", textAlign: "center", fontWeight: "500" },
});
