import { useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AuthStackParamList } from "../navigation/types";
import { useSendPhoneOtp, useVerifyPhoneOtp } from "../api/auth";
import { useLanguage } from "../i18n/LanguageContext";
import { LanguageSelector } from "../components/LanguageSelector";
import { Alert } from "../utils/alert";

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
    <View style={styles.container}>
      <LanguageSelector variant="dark" style={[styles.languageSelector, { top: insets.top + 16 }]} />

      <Text style={styles.title}>{t("phoneLogin.title")}</Text>

      {step === "phone" && (
        <>
          <Text style={styles.subtitle}>{t("phoneLogin.phoneStepSubtitle")}</Text>
          <TextInput
            style={styles.input}
            placeholder={t("phoneLogin.phoneNumber")}
            keyboardType="phone-pad"
            value={phone}
            onChangeText={setPhone}
          />
          <TouchableOpacity style={styles.button} onPress={onSendCode} disabled={isPending}>
            {isPending ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{t("phoneLogin.sendCode")}</Text>}
          </TouchableOpacity>
        </>
      )}

      {step === "code" && (
        <>
          <Text style={styles.subtitle}>{t("phoneLogin.codeStepSubtitle").replace("{phone}", phone.trim())}</Text>
          <TextInput
            style={styles.input}
            placeholder={t("phoneLogin.code")}
            keyboardType="number-pad"
            maxLength={6}
            value={code}
            onChangeText={setCode}
          />
          <TouchableOpacity style={styles.button} onPress={() => onVerify()} disabled={isPending}>
            {isPending ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{t("phoneLogin.verify")}</Text>}
          </TouchableOpacity>
          <TouchableOpacity onPress={onSendCode} disabled={isPending}>
            <Text style={styles.link}>{t("phoneLogin.resendCode")}</Text>
          </TouchableOpacity>
        </>
      )}

      {step === "name" && (
        <>
          <Text style={styles.subtitle}>{t("phoneLogin.nameStepSubtitle")}</Text>
          <TextInput style={styles.input} placeholder={t("common.fullName")} value={name} onChangeText={setName} />
          <TouchableOpacity style={styles.button} onPress={onSubmitName} disabled={isPending}>
            {isPending ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{t("phoneLogin.verify")}</Text>}
          </TouchableOpacity>
        </>
      )}

      <TouchableOpacity onPress={() => navigation.goBack()}>
        <Text style={styles.link}>{t("phoneLogin.backToLogin")}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 24, gap: 12, backgroundColor: "#fff" },
  title: { fontSize: 24, fontWeight: "700", textAlign: "center", marginBottom: 4 },
  subtitle: { fontSize: 14, color: "#666", textAlign: "center", marginBottom: 8 },
  input: { borderWidth: 1, borderColor: "#ddd", borderRadius: 10, padding: 14, fontSize: 16 },
  button: { backgroundColor: "#0f766e", borderRadius: 10, padding: 14, alignItems: "center", marginTop: 8 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  link: { color: "#0f766e", textAlign: "center", marginTop: 16, fontSize: 14 },
  languageSelector: { position: "absolute", right: 20 },
});
