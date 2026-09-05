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
