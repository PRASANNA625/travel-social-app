import type { ComponentProps } from "react";
import { Animated, Image, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons } from "@expo/vector-icons";
const SCENE_PHOTO = require("../../../assets/covers/hiker_rock.jpg");
import { useTheme } from "../../theme/ThemeContext";
import { ACTION_BLUE } from "../../theme/tokens";
import { useEntrance, usePingPong, useReduceMotion } from "../../hooks/useReduceMotion";

type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

const PERKS: { icon: IconName; label: string }[] = [
  { icon: "account-group-outline", label: "Explore together" },
  { icon: "account-multiple-plus-outline", label: "Meet like-minded travelers" },
  { icon: "map-marker-outline", label: "Discover new destinations" },
];

// Dashed flight path with a plane that drifts gently along its end.
function FlightPath({ color }: { color: string }) {
  const reduceMotion = useReduceMotion();
  const drift = usePingPong(2600, !reduceMotion);
  return (
    <View style={styles.flight} pointerEvents="none">
      <View style={[styles.arc, { borderColor: color }]} />
      <Animated.View
        style={[
          styles.plane,
          {
            transform: [
              { translateX: drift.interpolate({ inputRange: [0, 1], outputRange: [-3, 3] }) },
              { translateY: drift.interpolate({ inputRange: [0, 1], outputRange: [3, -3] }) },
              { rotate: "-35deg" },
            ],
          },
        ]}
      >
        <MaterialCommunityIcons name="airplane" size={30} color={ACTION_BLUE} />
      </Animated.View>
    </View>
  );
}

// Desktop: the full-height scenic column beside the form.
export function PlannerAside({ width }: { width: number }) {
  const { colors, scheme } = useTheme();
  const dark = scheme === "dark";
  const reduceMotion = useReduceMotion();
  const enter = useEntrance(80, reduceMotion, 700);
  const sky = dark ? ([colors.surfaceElevated, colors.surface] as const) : (["#e8f1ff", "#f4f8ff"] as const);
  return (
    <View style={[styles.aside, { width, borderRightColor: colors.border }]}>
      <LinearGradient colors={sky} locations={[0, 0.3]} style={StyleSheet.absoluteFill} />
      <View style={styles.photoWrap} pointerEvents="none">
        <Image source={SCENE_PHOTO} style={styles.photo} resizeMode="cover" accessibilityIgnoresInvertColors />
        {/* Fades the photo into the sky so the column reads as one scene. */}
        <LinearGradient colors={[sky[1], dark ? "rgba(0,0,0,0)" : "rgba(244,248,255,0)"]} style={styles.photoFade} />
        <View style={[styles.wave, { backgroundColor: colors.surface }]} />
      </View>

      <Animated.View
        style={[
          styles.asideTop,
          { opacity: enter, transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] },
        ]}
      >
        <View style={styles.brandRow}>
          <Image source={require("../../../assets/logo.png")} style={styles.logo} accessibilityIgnoresInvertColors />
          <View>
            <Text style={[styles.brandName, { color: dark ? colors.ink : "#0f2a4a" }]}>Triply</Text>
            <Text style={[styles.brandTag, { color: colors.muted }]}>Travel Together</Text>
          </View>
        </View>
        <Text style={[styles.headline, { color: colors.ink }]} accessibilityRole="header">
          Plan Your{"\n"}
          <Text style={{ color: dark ? "#7aa7ff" : ACTION_BLUE }}>Next Adventure</Text>
        </Text>
        <Text style={[styles.lede, { color: colors.muted }]}>Create a trip, invite fellow travelers and make unforgettable memories.</Text>
        {/* In the text's flow, so it always sits below the lede however it wraps. */}
        <FlightPath color={dark ? "rgba(122,167,255,0.6)" : "rgba(37,99,235,0.55)"} />
      </Animated.View>

      <View style={styles.perks}>
        {PERKS.map((p) => (
          <View key={p.label} style={styles.perkRow}>
            <MaterialCommunityIcons name={p.icon} size={22} color="#ffffff" />
            <Text style={styles.perkText}>{p.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// Tablet and phone: the same scene as a short banner above the form.
export function PlannerBanner({ compact }: { compact: boolean }) {
  return (
    <View style={[styles.banner, { height: compact ? 132 : 168 }]}>
      <Image source={SCENE_PHOTO} style={styles.bannerPhoto} resizeMode="cover" accessibilityIgnoresInvertColors />
      <LinearGradient colors={["rgba(15,42,74,0.78)", "rgba(15,42,74,0.15)"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
      <View style={styles.bannerText}>
        <Text style={[styles.bannerHeadline, compact && { fontSize: 22 }]} accessibilityRole="header">
          Plan Your <Text style={{ color: "#93c5fd" }}>Next Adventure</Text>
        </Text>
        <Text style={styles.bannerLede} numberOfLines={2}>
          Create a trip, invite fellow travelers and make unforgettable memories.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  aside: { height: "100%", overflow: "hidden", borderRightWidth: 1 },
  asideTop: { paddingHorizontal: 32, paddingTop: 34 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  logo: { width: 56, height: 56, borderRadius: 28 },
  brandName: { fontSize: 27, fontWeight: "800", letterSpacing: -0.5 },
  brandTag: { fontSize: 13, marginTop: -2 },
  headline: { fontSize: 34, lineHeight: 40, fontWeight: "800", letterSpacing: -0.8, marginTop: 64 },
  lede: { fontSize: 15.5, lineHeight: 23, marginTop: 16, maxWidth: 270 },
  flight: { height: 120, marginTop: 18, marginLeft: -72, marginRight: -32 },
  arc: {
    position: "absolute",
    left: 0,
    right: 50,
    top: 26,
    height: 220,
    borderTopWidth: 2,
    borderRightWidth: 2,
    borderStyle: "dashed",
    borderTopRightRadius: 260,
    transform: [{ rotate: "-12deg" }],
  },
  plane: { position: "absolute", right: 36, top: 0 },
  photoWrap: { position: "absolute", left: 0, right: 0, bottom: 0, height: "76%" },
  photo: { width: "100%", height: "100%" },
  photoFade: { position: "absolute", left: 0, right: 0, top: 0, height: "42%" },
  wave: {
    position: "absolute",
    left: "-30%",
    right: "-30%",
    bottom: -90,
    height: 140,
    borderTopLeftRadius: 400,
    borderTopRightRadius: 260,
    opacity: 0.92,
    transform: [{ rotate: "-4deg" }],
  },
  perks: {
    position: "absolute",
    left: 28,
    right: 28,
    bottom: 22,
    gap: 12,
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.4)",
    backgroundColor: "rgba(15,32,56,0.42)",
  },
  perkRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  perkText: { color: "#ffffff", fontSize: 14, fontWeight: "600" },
  banner: { borderRadius: 20, overflow: "hidden", justifyContent: "center" },
  bannerPhoto: { position: "absolute", top: 0, left: 0, width: "100%", height: "100%" },
  bannerText: { paddingHorizontal: 22, maxWidth: 520 },
  bannerHeadline: { color: "#ffffff", fontSize: 26, fontWeight: "800", letterSpacing: -0.5 },
  bannerLede: { color: "rgba(255,255,255,0.9)", fontSize: 13.5, lineHeight: 19, marginTop: 6 },
});
