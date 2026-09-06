import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { ResponseType } from "expo-auth-session";
import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import { useGoogleLogin } from "../api/auth";
import { Alert } from "../utils/alert";
import { useLanguage } from "../i18n/LanguageContext";
import { GOOGLE_CLIENT_ID } from "../utils/googleAuth";
import { useTheme } from "../theme/ThemeContext";

WebBrowser.maybeCompleteAuthSession();

// Web build: browsers support a stable redirect URL, so expo-auth-session's
// hosted-flow Google provider works reliably here even though Expo has
// deprecated it for native (see GoogleSignInButton.tsx, the native build).
export function GoogleSignInButton() {
  const { t } = useLanguage();
  const { colors } = useTheme();
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [googleResponse]);

  return (
    <TouchableOpacity
      style={[styles.googleButton, { borderColor: colors.border }]}
      onPress={() => promptGoogleLogin()}
      disabled={googleLogin.isPending}
    >
      {googleLogin.isPending ? (
        <ActivityIndicator color={colors.primary} />
      ) : (
        <>
          <MaterialCommunityIcons name="google" size={18} color={colors.ink} />
          <Text style={[styles.googleButtonText, { color: colors.ink }]}>{t("login.continueWithGoogle")}</Text>
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
    borderRadius: 14,
    paddingVertical: 14,
  },
  googleButtonText: { fontSize: 15, fontWeight: "600" },
});
