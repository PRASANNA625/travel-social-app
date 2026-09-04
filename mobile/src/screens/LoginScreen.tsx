import { useEffect, useState } from "react";
import {
  ActivityIndicator,
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
import Constants from "expo-constants";
import { ResponseType } from "expo-auth-session";
import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import type { AuthStackParamList } from "../navigation/types";
import { useGoogleLogin, useLogin } from "../api/auth";
import { Alert } from "../utils/alert";

WebBrowser.maybeCompleteAuthSession();

type Props = NativeStackScreenProps<AuthStackParamList, "Login">;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GOOGLE_CLIENT_ID = Constants.expoConfig?.extra?.googleClientId as string | undefined;

function GoogleSignInButton() {
  const googleLogin = useGoogleLogin();
  const [, googleResponse, promptGoogleLogin] = Google.useAuthRequest({
    webClientId: GOOGLE_CLIENT_ID,
    responseType: ResponseType.IdToken,
    scopes: ["openid", "profile", "email"],
  });

  useEffect(() => {
    if (googleResponse?.type === "success") {
      const idToken = googleResponse.params.id_token;
      if (idToken) {
        googleLogin.mutate(idToken, {
          onError: (err: any) =>
            Alert.alert("Google sign-in failed", err?.response?.data?.error ?? "Please try again"),
        });
      }
    } else if (googleResponse?.type === "error") {
      Alert.alert("Google sign-in failed", googleResponse.error?.message ?? "Please try again");
    }
  }, [googleResponse]);

  return (
    <TouchableOpacity
      style={styles.googleButton}
      onPress={() => promptGoogleLogin()}
      disabled={googleLogin.isPending}
    >
      {googleLogin.isPending ? (
        <ActivityIndicator color="#0f766e" />
      ) : (
        <>
          <MaterialCommunityIcons name="google" size={18} color="#334155" />
          <Text style={styles.googleButtonText}>Continue with Google</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

export function LoginScreen({ navigation }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const login = useLogin();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";

  const onSubmit = () => {
    const trimmedEmail = email.trim().toLowerCase();
    if (!EMAIL_REGEX.test(trimmedEmail) || !password) {
      Alert.alert("Check your details", "Enter a valid email address and your password.");
      return;
    }
    login.mutate(
      { email: trimmedEmail, password },
      { onError: (err: any) => Alert.alert("Login failed", err?.response?.data?.error ?? "Please try again") }
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
            <View style={styles.brandRow}>
              <View style={styles.logoBadge}>
                <MaterialCommunityIcons name="compass" size={22} color="#0f766e" />
              </View>
              <Text style={styles.brandName}>Travel & Social Meetup</Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.heading}>Welcome Back 👋</Text>
              <Text style={styles.subheading}>Log in to find your next trip and your next travel crew.</Text>

              <View style={styles.fieldWrap}>
                <MaterialCommunityIcons name="email-outline" size={18} color="#64748b" />
                <TextInput
                  style={styles.fieldInput}
                  placeholder="Email"
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
                  placeholder="Password"
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
                style={styles.loginButton}
                onPress={onSubmit}
                disabled={login.isPending}
                activeOpacity={0.9}
              >
                {login.isPending ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Text style={styles.loginButtonText}>Log In</Text>
                    <MaterialCommunityIcons name="arrow-right" size={18} color="#fff" />
                  </>
                )}
              </TouchableOpacity>

              {isWeb &&
                (GOOGLE_CLIENT_ID ? (
                  <GoogleSignInButton />
                ) : (
                  <Text style={styles.note}>Google sign-in isn't configured yet.</Text>
                ))}

              <View style={styles.secondaryActions}>
                <TouchableOpacity style={styles.secondaryLink} onPress={() => navigation.navigate("Register")}>
                  <MaterialCommunityIcons name="account-plus-outline" size={16} color="#0f766e" />
                  <Text style={styles.secondaryLinkText}>New here? Create an account</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.secondaryLink} onPress={() => navigation.navigate("PhoneLogin")}>
                  <MaterialCommunityIcons name="phone-outline" size={16} color="#0f766e" />
                  <Text style={styles.secondaryLinkText}>Log in with phone number</Text>
                </TouchableOpacity>
              </View>
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
  brandRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 28 },
  logoBadge: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
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
  loginButton: {
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
  loginButtonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  googleButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1.5,
    borderColor: "#e2e8f0",
    borderRadius: 14,
    paddingVertical: 14,
  },
  googleButtonText: { color: "#334155", fontSize: 15, fontWeight: "600" },
  note: { color: "#94a3b8", fontSize: 12, textAlign: "center" },
  secondaryActions: { gap: 2, marginTop: 6, alignItems: "center" },
  secondaryLink: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8 },
  secondaryLinkText: { color: "#0f766e", fontSize: 13.5, fontWeight: "600" },
});
