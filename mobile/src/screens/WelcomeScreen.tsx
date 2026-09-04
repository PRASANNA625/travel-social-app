import { useEffect, useRef } from "react";
import type { ComponentProps } from "react";
import { Animated, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AuthStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<AuthStackParamList, "Welcome">;
type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

const HIGHLIGHTS: { icon: IconName; label: string }[] = [
  { icon: "airplane-takeoff", label: "Trips" },
  { icon: "account-group", label: "People" },
  { icon: "map-marker-radius", label: "Memories" },
];

export function WelcomeScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const fade = useRef(new Animated.Value(0)).current;
  const rise = useRef(new Animated.Value(18)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 650, useNativeDriver: true }),
      Animated.spring(rise, { toValue: 0, friction: 8, tension: 40, useNativeDriver: true }),
    ]).start();
  }, [fade, rise]);

  return (
    <LinearGradient colors={["#0c4a6e", "#0f766e", "#134e4a"]} style={styles.flex}>
      <View style={[styles.decorCircle, styles.decorCircleTop]} />
      <View style={[styles.decorCircle, styles.decorCircleBottom]} />
      <MaterialCommunityIcons name="compass-outline" size={220} color="rgba(255,255,255,0.05)" style={styles.decorCompass} />

      <View style={[styles.page, isWeb && styles.pageWeb]}>
        <View style={[styles.content, { paddingTop: insets.top + 28, paddingBottom: insets.bottom + 24 }]}>
          <View style={styles.brandRow}>
            <View style={styles.logoBadge}>
              <MaterialCommunityIcons name="compass" size={26} color="#0f766e" />
            </View>
            <Text style={styles.brandName}>Travel & Social</Text>
          </View>

          <Animated.View style={[styles.heroBlock, { opacity: fade, transform: [{ translateY: rise }] }]}>
            <Text style={styles.headline}>Your Next Adventure{"\n"}Starts Here.</Text>
            <Text style={styles.subtitle}>Discover trips. Meet people. Create memories.</Text>

            <View style={styles.highlightRow}>
              {HIGHLIGHTS.map((item) => (
                <View key={item.label} style={styles.highlightItem}>
                  <View style={styles.highlightIconWrap}>
                    <MaterialCommunityIcons name={item.icon} size={18} color="#fff" />
                  </View>
                  <Text style={styles.highlightLabel}>{item.label}</Text>
                </View>
              ))}
            </View>
          </Animated.View>

          <Animated.View style={[styles.actions, { opacity: fade }]}>
            <TouchableOpacity
              style={styles.primaryButton}
              activeOpacity={0.9}
              onPress={() => navigation.navigate("Onboarding")}
            >
              <Text style={styles.primaryButtonText}>Get Started</Text>
              <MaterialCommunityIcons name="arrow-right" size={18} color="#0f766e" />
            </TouchableOpacity>

            <TouchableOpacity style={styles.secondaryLink} onPress={() => navigation.navigate("Login")}>
              <Text style={styles.secondaryLinkText}>
                Already have an account? <Text style={styles.secondaryLinkStrong}>Sign In</Text>
              </Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  page: { flex: 1, width: "100%" },
  pageWeb: { alignItems: "center", justifyContent: "center" },
  content: { flex: 1, width: "100%", maxWidth: 420, alignSelf: "center", paddingHorizontal: 28, justifyContent: "space-between" },
  decorCircle: {
    position: "absolute",
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  decorCircleTop: { width: 260, height: 260, top: -80, right: -70 },
  decorCircleBottom: { width: 340, height: 340, bottom: -120, left: -100 },
  decorCompass: { position: "absolute", bottom: 40, right: -50, transform: [{ rotate: "-18deg" }] },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  logoBadge: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#0f172a",
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  brandName: { color: "#fff", fontSize: 16, fontWeight: "700", letterSpacing: 0.3 },
  heroBlock: { gap: 14 },
  headline: { color: "#fff", fontSize: 38, fontWeight: "800", lineHeight: 44, letterSpacing: 0.2 },
  subtitle: { color: "rgba(255,255,255,0.82)", fontSize: 15.5, lineHeight: 22, maxWidth: 320 },
  highlightRow: { flexDirection: "row", gap: 22, marginTop: 8 },
  highlightItem: { alignItems: "center", gap: 6 },
  highlightIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    alignItems: "center",
    justifyContent: "center",
  },
  highlightLabel: { color: "rgba(255,255,255,0.85)", fontSize: 11.5, fontWeight: "600" },
  actions: { gap: 16 },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#fff",
    borderRadius: 999,
    paddingVertical: 16,
    shadowColor: "#0f172a",
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  primaryButtonText: { color: "#0f766e", fontSize: 16, fontWeight: "700" },
  secondaryLink: { alignItems: "center", paddingVertical: 4 },
  secondaryLinkText: { color: "rgba(255,255,255,0.85)", fontSize: 13.5 },
  secondaryLinkStrong: { color: "#fff", fontWeight: "700" },
});
