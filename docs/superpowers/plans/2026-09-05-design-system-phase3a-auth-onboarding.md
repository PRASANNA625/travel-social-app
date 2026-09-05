# Triply Design System Phase 3a (Auth & Onboarding) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix Welcome's gradient mismatch, de-duplicate Register onto the shared design-system tokens/components, token-ize Onboarding's exact-match literals, and fully redesign Phone Login to match Login/Register's visual language.

**Architecture:** Four independent, single-file tasks. Welcome and Onboarding are small, mechanical literal-substitution passes. Register is a component-adoption pass with zero intended visual change (the values already match the shared components exactly, with one documented 1px sub-pixel exception). Phone Login is the one real visual rewrite, following the exact pattern Register already demonstrates, plus a new i18n key added across all 5 language files.

**Tech Stack:** React Native (Expo), TypeScript. No test framework in this repo — verification is `npx tsc --noEmit` plus a manual code-trace confirming zero behavior change, consistent with every prior phase this session.

**Spec:** docs/superpowers/specs/2026-09-05-design-system-phase3a-auth-onboarding-design.md

## Global Constraints

- **Zero behavior changes.** Every `useState`, validation rule, mutation call, and navigation target in all 4 screen files must be byte-identical before and after. Only render/style code changes.
- **Token substitution rule** (Onboarding, Register): replace a hardcoded color/radius value with its token equivalent ONLY when the literal exactly matches a token value. A literal with no exact match stays a literal.
- **Do NOT wrap Welcome/Register/Phone Login's full-screen gradient in the `GradientBackground` component.** That component is tuned for a short "hero band" (Create Trip, Discover, Notifications) and always renders its own compass at a fixed size/position/opacity. Wrapping a full-screen auth gradient in it would replace Login/Register's larger, differently-positioned compass and drop their two decorative circles — a real visual regression. Keep the raw `LinearGradient` + `decorCircle`/compass markup that Login/Register already share verbatim; only the gradient's color VALUES come from the shared `GRADIENT_PRIMARY` export.
- **Onboarding's 4 slide gradients stay exactly as they are** — this is deliberate carousel variety, not a bug, and is explicitly out of scope for token substitution.
- **Accepted 1px exception:** `IconInput`'s internal `TextInput` uses `paddingVertical: 13`; Register's original `fieldInput` used `paddingVertical: 14`. `IconInput` has no prop to override this internal value, and the 1px difference is imperceptible at a 44+px field height. This is a deliberate, documented trade-off for adopting the shared component — not a defect to work around, matching the precedent set by Phase 2's `PrimaryButton` `paddingVertical` adoption on Trip Details.

---

### Task 1: Fix Welcome's gradient mismatch

**Files:**
- Modify: `mobile/src/screens/WelcomeScreen.tsx`

**Interfaces:**
- Consumes: `GRADIENT_PRIMARY` from `mobile/src/theme/tokens.ts` (existing export, unchanged: `{ colors: ["#1d4ed8", "#0f766e", "#0c2b28"], locations: [0, 0.55, 1] }`).

- [ ] **Step 1: Add the import**

In `mobile/src/screens/WelcomeScreen.tsx`, find:
```tsx
import { useLanguage } from "../i18n/LanguageContext";
import { LanguageSelector } from "../components/LanguageSelector";
```
Change to:
```tsx
import { useLanguage } from "../i18n/LanguageContext";
import { LanguageSelector } from "../components/LanguageSelector";
import { GRADIENT_PRIMARY } from "../theme/tokens";
```

- [ ] **Step 2: Use the shared gradient**

Find:
```tsx
    <LinearGradient colors={["#0c4a6e", "#0f766e", "#134e4a"]} style={styles.flex}>
```
Change to:
```tsx
    <LinearGradient colors={GRADIENT_PRIMARY.colors} locations={GRADIENT_PRIMARY.locations} style={styles.flex}>
```

Do not touch anything else in this file — the entrance animation (`logoOpacity`, `headlineOpacity`, `planeProgress`, etc.), decorative circles, compass, and reduce-motion handling are all unrelated to the gradient's color values and must stay exactly as they are.

- [ ] **Step 3: Verify**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

Run: `git diff mobile/src/screens/WelcomeScreen.tsx` and confirm exactly 2 hunks changed (the new import line, and the `LinearGradient` color/locations swap) — nothing else in the file differs.

- [ ] **Step 4: Commit**

```bash
git add mobile/src/screens/WelcomeScreen.tsx
git commit -m "Fix Welcome screen gradient to match the shared brand gradient"
```

---

### Task 2: De-duplicate Register onto shared tokens/components

**Files:**
- Modify: `mobile/src/screens/RegisterScreen.tsx`

**Interfaces:**
- Consumes: `GRADIENT_PRIMARY`, `COLORS` from `mobile/src/theme/tokens.ts`; `Card` from `mobile/src/components/theme/Card.tsx` (props `{ children, style }`); `IconInput` from `mobile/src/components/theme/IconInput.tsx` (props `{ icon, error, rightElement, style, ...TextInputProps }`); `PrimaryButton` from `mobile/src/components/theme/PrimaryButton.tsx` (props `{ label, onPress, icon, loading, disabled, style, variant }`) — all four are pre-existing, unchanged by this task.

- [ ] **Step 1: Replace the full file contents**

Replace all of `mobile/src/screens/RegisterScreen.tsx` with:

```tsx
import { useState } from "react";
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AuthStackParamList } from "../navigation/types";
import { useRegister } from "../api/auth";
import { Alert } from "../utils/alert";
import { useLanguage } from "../i18n/LanguageContext";
import { LanguageSelector } from "../components/LanguageSelector";
import { Card } from "../components/theme/Card";
import { IconInput } from "../components/theme/IconInput";
import { PrimaryButton } from "../components/theme/PrimaryButton";
import { COLORS, GRADIENT_PRIMARY } from "../theme/tokens";

type Props = NativeStackScreenProps<AuthStackParamList, "Register">;

export function RegisterScreen({ navigation }: Props) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const register = useRegister();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { t } = useLanguage();

  const onSubmit = () => {
    if (!name.trim() || !email.trim() || password.length < 8) {
      Alert.alert("Check your details", "Name, email, and an 8+ character password are required.");
      return;
    }
    register.mutate(
      { name: name.trim(), email: email.trim().toLowerCase(), password },
      { onError: (err: any) => Alert.alert("Sign up failed", err?.response?.data?.error ?? "Please try again") }
    );
  };

  return (
    <LinearGradient colors={GRADIENT_PRIMARY.colors} locations={GRADIENT_PRIMARY.locations} style={styles.flex}>
      <View style={[styles.decorCircle, styles.decorCircleTop]} />
      <View style={[styles.decorCircle, styles.decorCircleBottom]} />
      <MaterialCommunityIcons
        name="compass-outline"
        size={200}
        color="rgba(255,255,255,0.05)"
        style={styles.decorCompass}
      />

      <LanguageSelector style={[styles.languageSelector, { top: insets.top + 16 }]} />

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 32 },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[styles.page, isWeb && styles.pageWeb]}>
            <View style={styles.brandRow}>
              <Image source={require("../../assets/icon.png")} style={styles.logoBadge} />
              <Text style={styles.brandName}>{t("register.brand")}</Text>
            </View>

            <Card style={styles.card}>
              <Text style={styles.heading}>{t("register.heading")}</Text>
              <Text style={styles.subheading}>{t("register.subheading")}</Text>

              <IconInput
                icon="account-outline"
                placeholder={t("common.fullName")}
                value={name}
                onChangeText={setName}
              />

              <IconInput
                icon="email-outline"
                placeholder={t("common.email")}
                autoCapitalize="none"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
              />

              <IconInput
                icon="lock-outline"
                placeholder={t("register.passwordHint")}
                secureTextEntry={!showPassword}
                value={password}
                onChangeText={setPassword}
                rightElement={
                  <TouchableOpacity onPress={() => setShowPassword((v) => !v)} hitSlop={8}>
                    <MaterialCommunityIcons
                      name={showPassword ? "eye-off-outline" : "eye-outline"}
                      size={19}
                      color={COLORS.muted}
                    />
                  </TouchableOpacity>
                }
              />

              <PrimaryButton
                label={t("register.signUp")}
                onPress={onSubmit}
                disabled={register.isPending}
                loading={register.isPending}
                icon="arrow-right"
              />

              <TouchableOpacity style={styles.secondaryLink} onPress={() => navigation.navigate("Login")}>
                <MaterialCommunityIcons name="login" size={16} color={COLORS.primary} />
                <Text style={styles.secondaryLinkText}>{t("register.haveAccount")}</Text>
              </TouchableOpacity>
            </Card>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  decorCircle: { position: "absolute", borderRadius: 999, backgroundColor: "rgba(255,255,255,0.06)" },
  decorCircleTop: { width: 240, height: 240, top: -70, right: -60 },
  decorCircleBottom: { width: 300, height: 300, bottom: -100, left: -90 },
  decorCompass: { position: "absolute", top: "36%", left: -44, transform: [{ rotate: "12deg" }] },
  scrollContent: { flexGrow: 1, justifyContent: "center", paddingHorizontal: 24 },
  page: { width: "100%" },
  pageWeb: { maxWidth: 420, alignSelf: "center" },
  brandRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 24 },
  logoBadge: {
    width: 40,
    height: 40,
    borderRadius: 13,
    overflow: "hidden",
    shadowColor: COLORS.ink,
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  brandName: { color: COLORS.white, fontSize: 15, fontWeight: "700", letterSpacing: 0.2 },
  // Card's own defaults are padding:18, gap:12 - these two properties are
  // overridden here to preserve Register's original padding:24, gap:14
  // exactly (Card's backgroundColor/borderRadius/borderWidth/borderColor/
  // shadow already match Register's original values exactly and need no
  // override).
  card: { padding: 24, gap: 14 },
  heading: { fontSize: 24, fontWeight: "800", color: COLORS.ink },
  subheading: { fontSize: 13.5, color: COLORS.muted, lineHeight: 19, marginTop: -6, marginBottom: 4 },
  secondaryLink: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 8 },
  secondaryLinkText: { color: COLORS.primary, fontSize: 13.5, fontWeight: "600" },
  languageSelector: { position: "absolute", right: 20, zIndex: 10 },
});
```

Note: `fieldWrap`, `fieldInput`, `submitButton`, and `submitButtonText` style entries are gone — they're superseded by `IconInput`'s and `PrimaryButton`'s own internal styles. `card`'s old 8-property block (background/radius/border×2/shadow×4) is replaced by the 2-property override shown above.

- [ ] **Step 2: Verify with tsc**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual diff check**

Run: `git diff mobile/src/screens/RegisterScreen.tsx` and confirm: (a) `name`/`email`/`password`/`showPassword` state, `onSubmit`, and the `register.mutate` call are byte-identical; (b) the decorative circle/compass JSX and `decorCircle*`/`decorCompass` styles are untouched; (c) every color substitution is an exact token match (`COLORS.ink` for both `#0f172a` occurrences, `COLORS.white` for `#fff`, `COLORS.muted` for `#64748b`, `COLORS.primary` for `#0f766e`).

- [ ] **Step 4: Commit**

```bash
git add mobile/src/screens/RegisterScreen.tsx
git commit -m "De-duplicate Register screen onto shared design-system tokens and components"
```

---

### Task 3: Token-ize Onboarding's exact-match literals

**Files:**
- Modify: `mobile/src/screens/OnboardingScreen.tsx`

**Interfaces:**
- Consumes: `COLORS`, `RADIUS` from `mobile/src/theme/tokens.ts`.

- [ ] **Step 1: Replace the full file contents**

Replace all of `mobile/src/screens/OnboardingScreen.tsx` with:

```tsx
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
```

Note: `iconBadge`'s `rgba(255,255,255,0.14)`/`rgba(255,255,255,0.24)`, `description`/`skipText`'s `rgba(255,255,255,0.85)`, and `dot`'s `rgba(255,255,255,0.35)` are intentionally left as literals — none exactly matches a token. `SLIDES[].colors` are completely untouched.

- [ ] **Step 2: Verify with tsc**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual diff check**

Run: `git diff mobile/src/screens/OnboardingScreen.tsx` and confirm: (a) all 4 `SLIDES[].colors` pairs are byte-identical to before; (b) `index`/`slideWidth` state, `finish`/`goNext`/`onScrollEnd`, and `navigation.replace("Register")` are unchanged; (c) every changed line is a color/radius literal replaced by its exact token per the rule above.

- [ ] **Step 4: Commit**

```bash
git add mobile/src/screens/OnboardingScreen.tsx
git commit -m "Token-ize Onboarding screen colors (slide gradients unchanged)"
```

---

### Task 4: Redesign Phone Login to match Login/Register

**Files:**
- Modify: `mobile/src/screens/PhoneLoginScreen.tsx`
- Modify: `mobile/src/i18n/translations/en.json`
- Modify: `mobile/src/i18n/translations/hi.json`
- Modify: `mobile/src/i18n/translations/kn.json`
- Modify: `mobile/src/i18n/translations/ta.json`
- Modify: `mobile/src/i18n/translations/te.json`

**Interfaces:**
- Consumes: `GRADIENT_PRIMARY`, `COLORS` from `mobile/src/theme/tokens.ts`; `Card`, `IconInput`, `PrimaryButton` from `mobile/src/components/theme/` (same signatures as Task 2); the new i18n key `phoneLogin.brand` (added in this task).
- Produces: `phoneLogin.brand` translation key, value `"Triply"` in all 5 language files — no other task depends on this, but it must exist before the screen renders (the screen calls `t("phoneLogin.brand")`).

- [ ] **Step 1: Add the `phoneLogin.brand` key to all 5 language files**

In each of the 5 files below, find the line `"phoneLogin.title": "..."` and insert `"phoneLogin.brand": "Triply",` immediately before it (matching the exact pattern `welcome.brand`/`login.brand`/`register.brand` already use in every one of these files — all four brand keys have the identical value `"Triply"`, since the brand name itself doesn't get translated).

`mobile/src/i18n/translations/en.json` — find:
```json
  "phoneLogin.title": "Log in with phone",
```
Change to:
```json
  "phoneLogin.brand": "Triply",
  "phoneLogin.title": "Log in with phone",
```

`mobile/src/i18n/translations/hi.json` — find:
```json
  "phoneLogin.title": "फ़ोन से लॉग इन करें",
```
Change to:
```json
  "phoneLogin.brand": "Triply",
  "phoneLogin.title": "फ़ोन से लॉग इन करें",
```

`mobile/src/i18n/translations/kn.json` — find:
```json
  "phoneLogin.title": "ಫೋನ್ ಮೂಲಕ ಲಾಗಿನ್ ಮಾಡಿ",
```
Change to:
```json
  "phoneLogin.brand": "Triply",
  "phoneLogin.title": "ಫೋನ್ ಮೂಲಕ ಲಾಗಿನ್ ಮಾಡಿ",
```

`mobile/src/i18n/translations/ta.json` — find:
```json
  "phoneLogin.title": "தொலைபேசி மூலம் உள்நுழையவும்",
```
Change to:
```json
  "phoneLogin.brand": "Triply",
  "phoneLogin.title": "தொலைபேசி மூலம் உள்நுழையவும்",
```

`mobile/src/i18n/translations/te.json` — find:
```json
  "phoneLogin.title": "ఫోన్‌తో లాగిన్ చేయండి",
```
Change to:
```json
  "phoneLogin.brand": "Triply",
  "phoneLogin.title": "ఫోన్‌తో లాగిన్ చేయండి",
```

- [ ] **Step 2: Verify the i18n additions**

Run: `cd mobile && npx tsc --noEmit` (the i18n loader types translation keys, so a missing/mismatched key across files would surface here or in Step 5's check below).

Run this to confirm the key now exists exactly once in each of the 5 files:
```bash
grep -c '"phoneLogin.brand"' mobile/src/i18n/translations/en.json mobile/src/i18n/translations/hi.json mobile/src/i18n/translations/kn.json mobile/src/i18n/translations/ta.json mobile/src/i18n/translations/te.json
```
Expected: `1` for each of the 5 files.

- [ ] **Step 3: Replace the full file contents of the screen**

Replace all of `mobile/src/screens/PhoneLoginScreen.tsx` with:

```tsx
import { useState } from "react";
import { Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AuthStackParamList } from "../navigation/types";
import { useSendPhoneOtp, useVerifyPhoneOtp } from "../api/auth";
import { useLanguage } from "../i18n/LanguageContext";
import { LanguageSelector } from "../components/LanguageSelector";
import { Alert } from "../utils/alert";
import { Card } from "../components/theme/Card";
import { IconInput } from "../components/theme/IconInput";
import { PrimaryButton } from "../components/theme/PrimaryButton";
import { COLORS, GRADIENT_PRIMARY } from "../theme/tokens";

type Props = NativeStackScreenProps<AuthStackParamList, "PhoneLogin">;

type Step = "phone" | "code" | "name";

const NAME_REQUIRED_CODE = "NAME_REQUIRED";
const NAME_REQUIRED_ERROR = "Name is required to create an account";
const PHONE_REGEX = /^\+?\d{6,15}$/;

export function PhoneLoginScreen({ navigation }: Props) {
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");

  const sendOtp = useSendPhoneOtp();
  const verifyOtp = useVerifyPhoneOtp();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";

  const onSendCode = () => {
    const trimmedPhone = phone.trim();
    if (!PHONE_REGEX.test(trimmedPhone)) {
      Alert.alert("Check your details", "Enter a valid phone number.");
      return;
    }
    sendOtp.mutate(trimmedPhone, {
      onSuccess: () => setStep("code"),
      onError: (err: any) => Alert.alert("Couldn't send code", err?.response?.data?.error ?? "Please try again"),
    });
  };

  const onVerify = (withName?: string) => {
    if (!code.trim()) {
      Alert.alert("Check your details", "Enter the code we sent you.");
      return;
    }
    verifyOtp.mutate(
      { phone: phone.trim(), code: code.trim(), name: withName },
      {
        onError: (err: any) => {
          const code = err?.response?.data?.code;
          const message = err?.response?.data?.error;
          if (code === NAME_REQUIRED_CODE || message === NAME_REQUIRED_ERROR) {
            setStep("name");
            return;
          }
          Alert.alert("Verification failed", message ?? "Please try again");
        },
      }
    );
  };

  const onSubmitName = () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      Alert.alert("Check your details", "Enter your name.");
      return;
    }
    onVerify(trimmedName);
  };

  const isPending = sendOtp.isPending || verifyOtp.isPending;

  return (
    <LinearGradient colors={GRADIENT_PRIMARY.colors} locations={GRADIENT_PRIMARY.locations} style={styles.flex}>
      <View style={[styles.decorCircle, styles.decorCircleTop]} />
      <View style={[styles.decorCircle, styles.decorCircleBottom]} />
      <MaterialCommunityIcons
        name="compass-outline"
        size={200}
        color="rgba(255,255,255,0.05)"
        style={styles.decorCompass}
      />

      <LanguageSelector style={[styles.languageSelector, { top: insets.top + 16 }]} />

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 32 },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[styles.page, isWeb && styles.pageWeb]}>
            <View style={styles.brandRow}>
              <Image source={require("../../assets/icon.png")} style={styles.logoBadge} />
              <Text style={styles.brandName}>{t("phoneLogin.brand")}</Text>
            </View>

            <Card style={styles.card}>
              <Text style={styles.heading}>{t("phoneLogin.title")}</Text>

              {step === "phone" && (
                <>
                  <Text style={styles.subheading}>{t("phoneLogin.phoneStepSubtitle")}</Text>
                  <IconInput
                    icon="cellphone"
                    placeholder={t("phoneLogin.phoneNumber")}
                    keyboardType="phone-pad"
                    value={phone}
                    onChangeText={setPhone}
                  />
                  <PrimaryButton
                    label={t("phoneLogin.sendCode")}
                    onPress={onSendCode}
                    disabled={isPending}
                    loading={isPending}
                    icon="arrow-right"
                  />
                </>
              )}

              {step === "code" && (
                <>
                  <Text style={styles.subheading}>{t("phoneLogin.codeStepSubtitle").replace("{phone}", phone.trim())}</Text>
                  <IconInput
                    icon="message-text-outline"
                    placeholder={t("phoneLogin.code")}
                    keyboardType="number-pad"
                    maxLength={6}
                    value={code}
                    onChangeText={setCode}
                  />
                  <PrimaryButton
                    label={t("phoneLogin.verify")}
                    onPress={() => onVerify()}
                    disabled={isPending}
                    loading={isPending}
                    icon="arrow-right"
                  />
                  <TouchableOpacity style={styles.secondaryLink} onPress={onSendCode} disabled={isPending}>
                    <MaterialCommunityIcons name="refresh" size={16} color={COLORS.primary} />
                    <Text style={styles.secondaryLinkText}>{t("phoneLogin.resendCode")}</Text>
                  </TouchableOpacity>
                </>
              )}

              {step === "name" && (
                <>
                  <Text style={styles.subheading}>{t("phoneLogin.nameStepSubtitle")}</Text>
                  <IconInput
                    icon="account-outline"
                    placeholder={t("common.fullName")}
                    value={name}
                    onChangeText={setName}
                  />
                  <PrimaryButton
                    label={t("phoneLogin.verify")}
                    onPress={onSubmitName}
                    disabled={isPending}
                    loading={isPending}
                    icon="arrow-right"
                  />
                </>
              )}

              <TouchableOpacity style={styles.secondaryLink} onPress={() => navigation.goBack()}>
                <MaterialCommunityIcons name="arrow-left" size={16} color={COLORS.primary} />
                <Text style={styles.secondaryLinkText}>{t("phoneLogin.backToLogin")}</Text>
              </TouchableOpacity>
            </Card>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  decorCircle: { position: "absolute", borderRadius: 999, backgroundColor: "rgba(255,255,255,0.06)" },
  decorCircleTop: { width: 240, height: 240, top: -70, right: -60 },
  decorCircleBottom: { width: 300, height: 300, bottom: -100, left: -90 },
  decorCompass: { position: "absolute", top: "36%", left: -44, transform: [{ rotate: "12deg" }] },
  scrollContent: { flexGrow: 1, justifyContent: "center", paddingHorizontal: 24 },
  page: { width: "100%" },
  pageWeb: { maxWidth: 420, alignSelf: "center" },
  brandRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 24 },
  logoBadge: {
    width: 40,
    height: 40,
    borderRadius: 13,
    overflow: "hidden",
    shadowColor: COLORS.ink,
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  brandName: { color: COLORS.white, fontSize: 15, fontWeight: "700", letterSpacing: 0.2 },
  card: { padding: 24, gap: 14 },
  heading: { fontSize: 24, fontWeight: "800", color: COLORS.ink },
  subheading: { fontSize: 13.5, color: COLORS.muted, lineHeight: 19, marginTop: -6, marginBottom: 4 },
  secondaryLink: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 8 },
  secondaryLinkText: { color: COLORS.primary, fontSize: 13.5, fontWeight: "600" },
  languageSelector: { position: "absolute", right: 20, zIndex: 10 },
});
```

Note: every handler (`onSendCode`, `onVerify`, `onSubmitName`), the `step` state machine, `PHONE_REGEX`/`NAME_REQUIRED_CODE`/`NAME_REQUIRED_ERROR` constants, and the `sendOtp`/`verifyOtp` mutation wiring are copied verbatim from the original file — only the render/JSX and stylesheet changed. `isPending` is now also passed to `IconInput`-adjacent `PrimaryButton`'s `disabled`/`loading` props (previously it drove a manually-rendered `ActivityIndicator`/`Text` conditional at each of the 3 call sites — `PrimaryButton`'s own `loading` prop reproduces that exactly).

Note: `LanguageSelector`'s `variant="dark"` prop from the original file is **deliberately dropped** (falls back to its default, `"light"`). `variant="dark"` renders dark text on a light pill, which was correct for this screen's old plain-white background — but this screen now sits on the same gradient background as Login/Register, which both use the default `"light"` variant (light/white text) for exactly that reason. Keeping `variant="dark"` here would render low-contrast dark text against the gradient. This is an intentional fix, not an accidental omission.

- [ ] **Step 4: Verify with tsc**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual diff check**

Run: `git diff mobile/src/screens/PhoneLoginScreen.tsx` and confirm: (a) `PHONE_REGEX`, `NAME_REQUIRED_CODE`, `NAME_REQUIRED_ERROR` constants are unchanged; (b) `onSendCode`, `onVerify`, `onSubmitName` function bodies are byte-identical to the original (extract and diff them if unsure); (c) all 3 `step === "..."` branches route to the same handler with the same arguments as before; (d) `navigation.goBack()` on the back-to-login link and `navigation` prop usage elsewhere are unchanged; (e) `LanguageSelector`'s `variant="dark"` prop is gone (intentional per the note above, not a missed prop).

- [ ] **Step 6: Commit**

```bash
git add mobile/src/screens/PhoneLoginScreen.tsx mobile/src/i18n/translations/en.json mobile/src/i18n/translations/hi.json mobile/src/i18n/translations/kn.json mobile/src/i18n/translations/ta.json mobile/src/i18n/translations/te.json
git commit -m "Redesign Phone Login to match Login/Register's gradient and card pattern"
```
