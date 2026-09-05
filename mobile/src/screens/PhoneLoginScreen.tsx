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
