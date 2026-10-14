import { useEffect, useMemo, useRef, useState } from "react";
import type { ComponentProps } from "react";
import {
  Animated,
  Easing,
  Image,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type ImageSourcePropType,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AuthStackParamList } from "../navigation/types";
import { useLanguage } from "../i18n/LanguageContext";
import { ACTION_BLUE, RADIUS } from "../theme/tokens";
import { useNativeDriver, useReduceMotion } from "../hooks/useReduceMotion";

type Props = NativeStackScreenProps<AuthStackParamList, "Onboarding">;
type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

interface Slide {
  icon: IconName;
  titleKey: string;
  descriptionKey: string;
  photo: ImageSourcePropType;
}

const SLIDES: Slide[] = [
  { icon: "compass-outline", titleKey: "onboarding.slide1Title", descriptionKey: "onboarding.slide1Desc", photo: require("../../assets/covers/himalaya.jpg") },
  { icon: "account-group-outline", titleKey: "onboarding.slide2Title", descriptionKey: "onboarding.slide2Desc", photo: require("../../assets/covers/trek.jpg") },
  { icon: "map-marker-path", titleKey: "onboarding.slide3Title", descriptionKey: "onboarding.slide3Desc", photo: require("../../assets/covers/car.jpg") },
  { icon: "camera-outline", titleKey: "onboarding.slide4Title", descriptionKey: "onboarding.slide4Desc", photo: require("../../assets/covers/tent.jpg") },
];

// One photo per slide, stacked; the active one fades in and drifts slowly.
function Backdrop({ index, reduceMotion }: { index: number; reduceMotion: boolean }) {
  const fades = useRef(SLIDES.map((_, i) => new Animated.Value(i === 0 ? 1 : 0))).current;
  const zoom = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel(
      fades.map((v, i) => Animated.timing(v, { toValue: i === index ? 1 : 0, duration: reduceMotion ? 0 : 700, easing: Easing.out(Easing.quad), useNativeDriver }))
    ).start();
    zoom.setValue(0);
    if (!reduceMotion) {
      Animated.timing(zoom, { toValue: 1, duration: 9000, easing: Easing.out(Easing.quad), useNativeDriver, isInteraction: false }).start();
    }
  }, [index, reduceMotion, fades, zoom]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {SLIDES.map((slide, i) => (
        <Animated.Image
          key={slide.titleKey}
          source={slide.photo}
          resizeMode="cover"
          style={[
            styles.photo,
            {
              opacity: fades[i],
              transform: [{ scale: i === index ? zoom.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }) : 1 }],
            },
          ]}
          accessibilityIgnoresInvertColors
        />
      ))}
      {/* Darkens the lower part for text, and the top edge for the logo. */}
      <LinearGradient colors={["rgba(6,18,36,0.55)", "rgba(6,18,36,0)"]} style={styles.topShade} />
      <LinearGradient
        colors={["rgba(6,18,36,0)", "rgba(6,18,36,0.55)", "rgba(6,18,36,0.92)"]}
        locations={[0, 0.45, 1]}
        style={styles.bottomShade}
      />
    </View>
  );
}

export function OnboardingScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const { t } = useLanguage();
  const reduceMotion = useReduceMotion();
  const [index, setIndex] = useState(0);
  const isFirst = index === 0;
  const isLast = index === SLIDES.length - 1;
  const slide = SLIDES[index];

  const finish = () => navigation.replace("Register");
  const goTo = (i: number) => setIndex(Math.max(0, Math.min(SLIDES.length - 1, i)));
  const next = () => (isLast ? finish() : goTo(index + 1));
  const back = () => goTo(index - 1);

  // Text rises and fades in on every slide change.
  const enter = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reduceMotion) return;
    enter.setValue(0);
    Animated.timing(enter, { toValue: 1, duration: 520, easing: Easing.out(Easing.cubic), useNativeDriver }).start();
  }, [index, reduceMotion, enter]);

  // Web: arrow keys move between slides, Enter continues.
  const keyHandler = useRef<(e: KeyboardEvent) => void>(() => {});
  keyHandler.current = (e) => {
    if (e.key === "ArrowRight") next();
    else if (e.key === "ArrowLeft") back();
  };
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const onKey = (e: KeyboardEvent) => keyHandler.current(e);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Touch: swipe left or right to change slides.
  const swipe = useRef<{ next: () => void; back: () => void }>({ next, back });
  swipe.current = { next, back };
  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 18 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
        onPanResponderRelease: (_, g) => {
          if (g.dx < -50) swipe.current.next();
          else if (g.dx > 50) swipe.current.back();
        },
      }),
    []
  );

  const gutter = wide ? 64 : 24;

  return (
    <View style={styles.screen} {...pan.panHandlers}>
      <Backdrop index={index} reduceMotion={reduceMotion} />

      <View style={[styles.topBar, { paddingTop: insets.top + (wide ? 28 : 16), paddingHorizontal: gutter }]}>
        <View style={styles.brand}>
          <Image source={require("../../assets/logo.png")} style={[styles.logo, wide && styles.logoWide]} accessibilityIgnoresInvertColors />
          <Text style={[styles.brandName, wide && styles.brandNameWide]}>Triply</Text>
        </View>
        {!isLast && (
          <Pressable onPress={finish} style={styles.skip} accessibilityRole="button" hitSlop={8}>
            <Text style={styles.skipText}>{t("onboarding.skip")}</Text>
          </Pressable>
        )}
      </View>

      <View style={[styles.bottom, { paddingHorizontal: gutter, paddingBottom: insets.bottom + (wide ? 56 : 28) }]}>
        <Animated.View
          style={[
            styles.copy,
            wide && styles.copyWide,
            { opacity: enter, transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }] },
          ]}
          accessibilityLiveRegion="polite"
        >
          <View style={styles.stepRow}>
            <View style={styles.stepIcon}>
              <MaterialCommunityIcons name={slide.icon} size={18} color="#ffffff" />
            </View>
            <Text style={styles.stepText}>{`${String(index + 1).padStart(2, "0")} / ${String(SLIDES.length).padStart(2, "0")}`}</Text>
          </View>
          <Text style={[styles.title, wide && styles.titleWide]} accessibilityRole="header">
            {t(slide.titleKey)}
          </Text>
          <Text style={[styles.description, wide && styles.descriptionWide]}>{t(slide.descriptionKey)}</Text>
        </Animated.View>

        <View style={[styles.controls, wide && styles.controlsWide]}>
          <View style={styles.progress} accessibilityRole="tablist">
            {SLIDES.map((s, i) => (
              <Pressable
                key={s.titleKey}
                onPress={() => goTo(i)}
                style={styles.segmentHit}
                accessibilityRole="tab"
                accessibilityState={{ selected: i === index }}
                accessibilityLabel={`${t(s.titleKey)}, ${i + 1} of ${SLIDES.length}`}
              >
                <View style={[styles.segment, i <= index && styles.segmentDone, i === index && styles.segmentActive]} />
              </Pressable>
            ))}
          </View>

          <View style={styles.buttons}>
            {!isFirst && (
              <Pressable
                onPress={back}
                style={(state) => [styles.backButton, (state as { hovered?: boolean }).hovered && styles.backButtonHover]}
                accessibilityRole="button"
                accessibilityLabel={t("onboarding.back")}
              >
                <MaterialCommunityIcons name="arrow-left" size={22} color="#ffffff" />
              </Pressable>
            )}
            <Pressable
              onPress={next}
              style={(state) => [
                styles.nextButton,
                isLast && styles.nextButtonLast,
                (state as { hovered?: boolean }).hovered && styles.nextButtonHover,
                state.pressed && styles.pressed,
              ]}
              accessibilityRole="button"
            >
              <Text style={[styles.nextText, isLast && styles.nextTextLast]}>{isLast ? t("onboarding.getStarted") : t("onboarding.next")}</Text>
              <MaterialCommunityIcons name={isLast ? "rocket-launch-outline" : "arrow-right"} size={20} color={isLast ? "#ffffff" : "#0f2a4a"} />
            </Pressable>
          </View>

          {isLast && (
            <Text style={styles.signIn}>
              {t("welcome.haveAccount")}
              <Text style={styles.signInLink} onPress={() => navigation.replace("Login")} accessibilityRole="link">
                {t("welcome.signIn")}
              </Text>
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}

const WEB_TRANSITION = Platform.OS === "web" ? ({ transitionProperty: "transform, background-color, box-shadow", transitionDuration: "160ms" } as object) : null;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#061224", overflow: "hidden" },
  photo: { position: "absolute", top: 0, left: 0, width: "100%", height: "100%" },
  topShade: { position: "absolute", top: 0, left: 0, right: 0, height: 180 },
  bottomShade: { position: "absolute", left: 0, right: 0, bottom: 0, height: "72%" },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  brand: { flexDirection: "row", alignItems: "center", gap: 10 },
  logo: { width: 40, height: 40, borderRadius: 20 },
  logoWide: { width: 48, height: 48, borderRadius: 24 },
  brandName: { color: "#ffffff", fontSize: 22, fontWeight: "800", letterSpacing: -0.4 },
  brandNameWide: { fontSize: 26 },
  skip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: RADIUS.pill, backgroundColor: "rgba(255,255,255,0.16)", borderWidth: 1, borderColor: "rgba(255,255,255,0.3)" },
  skipText: { color: "#ffffff", fontSize: 14, fontWeight: "700" },
  bottom: { flex: 1, justifyContent: "flex-end", gap: 28 },
  copy: { maxWidth: 520 },
  copyWide: { maxWidth: 640 },
  stepRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 16 },
  stepIcon: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.18)", borderWidth: 1, borderColor: "rgba(255,255,255,0.3)" },
  stepText: { color: "rgba(255,255,255,0.85)", fontSize: 13, fontWeight: "700", letterSpacing: 1.5 },
  title: { color: "#ffffff", fontSize: 32, lineHeight: 38, fontWeight: "800", letterSpacing: -0.6 },
  titleWide: { fontSize: 52, lineHeight: 58, letterSpacing: -1.2 },
  description: { color: "rgba(255,255,255,0.88)", fontSize: 16, lineHeight: 24, marginTop: 12, maxWidth: 440 },
  descriptionWide: { fontSize: 18, lineHeight: 28, marginTop: 16, maxWidth: 520 },
  controls: { gap: 22 },
  controlsWide: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" },
  progress: { flexDirection: "row", gap: 6, minWidth: 0 },
  // 44px tall to tap; the negative margin keeps the bar where it was.
  segmentHit: { paddingVertical: 20, marginVertical: -10 },
  segment: { width: 40, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.3)" },
  segmentDone: { backgroundColor: "rgba(255,255,255,0.65)" },
  segmentActive: { width: 64, backgroundColor: "#ffffff" },
  buttons: { flexDirection: "row", alignItems: "center", gap: 12 },
  backButton: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.45)",
    backgroundColor: "rgba(255,255,255,0.08)",
    ...WEB_TRANSITION,
  },
  backButtonHover: { backgroundColor: "rgba(255,255,255,0.2)" },
  nextButton: {
    flexGrow: 1,
    maxWidth: 320,
    minWidth: 180,
    height: 54,
    borderRadius: RADIUS.pill,
    backgroundColor: "#ffffff",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 28,
    shadowColor: "#000000",
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
    ...WEB_TRANSITION,
  },
  nextButtonLast: { backgroundColor: ACTION_BLUE },
  nextButtonHover: { transform: [{ translateY: -1 }], shadowOpacity: 0.35 },
  pressed: { transform: [{ scale: 0.98 }] },
  nextText: { color: "#0f2a4a", fontSize: 16.5, fontWeight: "800" },
  nextTextLast: { color: "#ffffff" },
  signIn: { color: "rgba(255,255,255,0.85)", fontSize: 14.5, width: "100%" },
  signInLink: { color: "#ffffff", fontWeight: "800", textDecorationLine: "underline" },
});
