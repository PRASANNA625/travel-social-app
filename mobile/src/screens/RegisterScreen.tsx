import { useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
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
    <LinearGradient colors={["#1d4ed8", "#0f766e", "#0c2b28"]} locations={[0, 0.55, 1]} style={styles.flex}>
      <View style={[styles.decorCircle, styles.decorCircleTop]} />
      <View style={[styles.decorCircle, styles.decorCircleBottom]} />
      <MaterialCommunityIcons
        name="compass-outline"
        size={200}
        color="rgba(255,255,255,0.05)"
        style={styles.decorCompass}
      />

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 32 },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[styles.page, isWeb && styles.pageWeb]}>
            <LanguageSelector style={styles.languageSelector} />
            <View style={styles.brandRow}>
              <Image source={require("../../assets/icon.png")} style={styles.logoBadge} />
              <Text style={styles.brandName}>{t("register.brand")}</Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.heading}>{t("register.heading")}</Text>
              <Text style={styles.subheading}>{t("register.subheading")}</Text>

              <View style={styles.fieldWrap}>
                <MaterialCommunityIcons name="account-outline" size={18} color="#64748b" />
                <TextInput
                  style={styles.fieldInput}
                  placeholder={t("common.fullName")}
                  placeholderTextColor="#94a3b8"
                  value={name}
                  onChangeText={setName}
                />
              </View>

              <View style={styles.fieldWrap}>
                <MaterialCommunityIcons name="email-outline" size={18} color="#64748b" />
                <TextInput
                  style={styles.fieldInput}
                  placeholder={t("common.email")}
                  placeholderTextColor="#94a3b8"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  value={email}
                  onChangeText={setEmail}
                />
              </View>

              <View style={styles.fieldWrap}>
                <MaterialCommunityIcons name="lock-outline" size={18} color="#64748b" />
                <TextInput
                  style={styles.fieldInput}
                  placeholder={t("register.passwordHint")}
                  placeholderTextColor="#94a3b8"
                  secureTextEntry={!showPassword}
                  value={password}
                  onChangeText={setPassword}
                />
                <TouchableOpacity onPress={() => setShowPassword((v) => !v)} hitSlop={8}>
                  <MaterialCommunityIcons
                    name={showPassword ? "eye-off-outline" : "eye-outline"}
                    size={19}
                    color="#64748b"
                  />
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={styles.submitButton}
                onPress={onSubmit}
                disabled={register.isPending}
                activeOpacity={0.9}
              >
                {register.isPending ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Text style={styles.submitButtonText}>{t("register.signUp")}</Text>
                    <MaterialCommunityIcons name="arrow-right" size={18} color="#fff" />
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity style={styles.secondaryLink} onPress={() => navigation.navigate("Login")}>
                <MaterialCommunityIcons name="login" size={16} color="#0f766e" />
                <Text style={styles.secondaryLinkText}>{t("register.haveAccount")}</Text>
              </TouchableOpacity>
            </View>
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
    shadowColor: "#0f172a",
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  brandName: { color: "#fff", fontSize: 15, fontWeight: "700", letterSpacing: 0.2 },
  card: {
    backgroundColor: "rgba(255,255,255,0.96)",
    borderRadius: 24,
    padding: 24,
    gap: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.5)",
    shadowColor: "#0f172a",
    shadowOpacity: 0.25,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  heading: { fontSize: 24, fontWeight: "800", color: "#0f172a" },
  subheading: { fontSize: 13.5, color: "#64748b", lineHeight: 19, marginTop: -6, marginBottom: 4 },
  fieldWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 14,
    paddingHorizontal: 14,
  },
  fieldInput: { flex: 1, paddingVertical: 14, fontSize: 15, color: "#0f172a" },
  submitButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#0f766e",
    borderRadius: 14,
    paddingVertical: 15,
    marginTop: 6,
    shadowColor: "#0f766e",
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  submitButtonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  secondaryLink: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 8 },
  secondaryLinkText: { color: "#0f766e", fontSize: 13.5, fontWeight: "600" },
  languageSelector: { position: "absolute", top: 0, right: 0, zIndex: 10 },
});
