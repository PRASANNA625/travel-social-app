import { useRef, useState } from "react";
import type { ComponentProps } from "react";
import {
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AuthStackParamList } from "../navigation/types";
import { useLanguage } from "../i18n/LanguageContext";
import { LanguageSelector } from "../components/LanguageSelector";
import { COLORS, RADIUS } from "../theme/tokens";

type Props = NativeStackScreenProps<AuthStackParamList, "Onboarding">;
type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

interface Slide {
  icon: IconName;
  titleKey: string;
  descriptionKey: string;
  colors: [string, string];
}

// Deliberately varied per slide (all four colors are the same brand
// palette used elsewhere), not the shared GRADIENT_PRIMARY - a carousel
// variety choice, not a bug. Left as local literals per the design spec.
const SLIDES: Slide[] = [
  { icon: "image-filter-hdr", titleKey: "onboarding.slide1Title", descriptionKey: "onboarding.slide1Desc", colors: ["#0c4a6e", "#0f766e"] },
  { icon: "account-group", titleKey: "onboarding.slide2Title", descriptionKey: "onboarding.slide2Desc", colors: ["#1d4ed8", "#0f766e"] },
  { icon: "map-marker-path", titleKey: "onboarding.slide3Title", descriptionKey: "onboarding.slide3Desc", colors: ["#0f766e", "#134e4a"] },
  { icon: "handshake-outline", titleKey: "onboarding.slide4Title", descriptionKey: "onboarding.slide4Desc", colors: ["#0f766e", "#0c4a6e"] },
];

export function OnboardingScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [slideWidth, setSlideWidth] = useState(width);
  const [index, setIndex] = useState(0);
  const listRef = useRef<FlatList<Slide>>(null);
  const isWeb = Platform.OS === "web";
  const isLast = index === SLIDES.length - 1;
  const { t } = useLanguage();

  const finish = () => navigation.replace("Register");

  const goNext = () => {
    if (isLast) {
      finish();
      return;
    }
    listRef.current?.scrollToIndex({ index: index + 1, animated: true });
  };

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setIndex(Math.round(e.nativeEvent.contentOffset.x / slideWidth));
  };

  return (
    <View style={styles.flex} onLayout={(e) => setSlideWidth(e.nativeEvent.layout.width)}>
      <FlatList
        ref={listRef}
        data={SLIDES}
        keyExtractor={(item) => item.titleKey}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
        style={styles.flex}
        getItemLayout={(_, i) => ({ length: slideWidth, offset: slideWidth * i, index: i })}
        renderItem={({ item }) => (
          <LinearGradient colors={item.colors} style={[styles.slide, { width: slideWidth }]}>
            <View style={[styles.slideContent, isWeb && styles.slideContentWeb]}>
              <View style={styles.iconBadge}>
                <MaterialCommunityIcons name={item.icon} size={64} color={COLORS.white} />
              </View>
              <Text style={styles.title}>{t(item.titleKey)}</Text>
              <Text style={styles.description}>{t(item.descriptionKey)}</Text>
            </View>
          </LinearGradient>
        )}
      />

      <TouchableOpacity style={[styles.skipButton, { top: insets.top + 16 }]} onPress={finish}>
        <Text style={styles.skipText}>{t("onboarding.skip")}</Text>
      </TouchableOpacity>

      <LanguageSelector variant="light" style={[styles.languageSelector, { top: insets.top + 16 }]} />

      <View style={[styles.bottomBar, isWeb && styles.bottomBarWeb, { paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.dotsRow}>
          {SLIDES.map((slide, i) => (
            <View key={slide.titleKey} style={[styles.dot, i === index && styles.dotActive]} />
          ))}
        </View>

        <TouchableOpacity style={styles.nextButton} activeOpacity={0.9} onPress={goNext}>
          <Text style={styles.nextButtonText}>{isLast ? t("onboarding.getStarted") : t("onboarding.next")}</Text>
          <MaterialCommunityIcons name={isLast ? "rocket-launch-outline" : "arrow-right"} size={18} color={COLORS.primary} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  slide: { flex: 1, alignItems: "center", justifyContent: "center" },
  slideContent: { width: "100%", paddingHorizontal: 32, alignItems: "center", gap: 18 },
  slideContentWeb: { maxWidth: 420, alignSelf: "center" },
  iconBadge: {
    width: 132,
    height: 132,
    borderRadius: 66,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.24)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  title: { color: COLORS.white, fontSize: 26, fontWeight: "800", textAlign: "center", lineHeight: 32 },
  description: { color: "rgba(255,255,255,0.85)", fontSize: 15, lineHeight: 22, textAlign: "center", maxWidth: 300 },
  skipButton: { position: "absolute", right: 20, paddingHorizontal: 14, paddingVertical: 8 },
  skipText: { color: "rgba(255,255,255,0.85)", fontSize: 14, fontWeight: "600" },
  bottomBar: { position: "absolute", left: 0, right: 0, bottom: 0, alignItems: "center", gap: 22, paddingTop: 16 },
  bottomBarWeb: { paddingHorizontal: 32 },
  dotsRow: { flexDirection: "row", gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.35)" },
  dotActive: { width: 22, backgroundColor: COLORS.white },
  nextButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.pill,
    paddingVertical: 15,
    paddingHorizontal: 36,
    width: "100%",
    maxWidth: 340,
    shadowColor: COLORS.ink,
    shadowOpacity: 0.22,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  nextButtonText: { color: COLORS.primary, fontSize: 16, fontWeight: "700" },
  languageSelector: { position: "absolute", left: 20 },
});
