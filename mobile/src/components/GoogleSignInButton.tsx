import { ActivityIndicator, StyleSheet, Text, TouchableOpacity } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import {
  GoogleSignin,
  isErrorWithCode,
  isSuccessResponse,
  statusCodes,
} from "@react-native-google-signin/google-signin";
import { useGoogleLogin } from "../api/auth";
import { Alert } from "../utils/alert";
import { useLanguage } from "../i18n/LanguageContext";
import { GOOGLE_CLIENT_ID } from "../utils/googleAuth";

// Native build (Android for now): expo-auth-session's hosted-flow Google
// provider is unreliable here (Expo Go/dev-client redirect URLs aren't
// stable enough for Google to trust, and Expo has deprecated that approach
// for native anyway) - this uses the native Google Sign-In SDK instead,
// which requires a custom dev-client/production build (not plain Expo Go).
// Still verified by the same backend endpoint against the same web client
// ID as the Web build, via GoogleSignin's webClientId option.
GoogleSignin.configure({ webClientId: GOOGLE_CLIENT_ID });

export function GoogleSignInButton() {
  const { t } = useLanguage();
  const googleLogin = useGoogleLogin();

  const onPress = async () => {
    try {
      await GoogleSignin.hasPlayServices();
      const response = await GoogleSignin.signIn();
      if (isSuccessResponse(response)) {
        const idToken = response.data.idToken;
        if (idToken) {
          googleLogin.mutate(idToken, {
            onError: (err: any) =>
              Alert.alert("Google sign-in failed", err?.response?.data?.error ?? "Please try again"),
          });
        }
      }
    } catch (err) {
      if (isErrorWithCode(err) && err.code === statusCodes.SIGN_IN_CANCELLED) return;
      if (isErrorWithCode(err) && err.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        Alert.alert("Google Play Services required", "Please update Google Play Services and try again.");
        return;
      }
      Alert.alert("Google sign-in failed", "Please try again");
    }
  };

  return (
    <TouchableOpacity style={styles.googleButton} onPress={onPress} disabled={googleLogin.isPending}>
      {googleLogin.isPending ? (
        <ActivityIndicator color="#0f766e" />
      ) : (
        <>
          <MaterialCommunityIcons name="google" size={18} color="#334155" />
          <Text style={styles.googleButtonText}>{t("login.continueWithGoogle")}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
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
});
