import { useEffect, useState } from "react";
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AuthStackParamList } from "../navigation/types";
import { useForgotPassword } from "../api/auth";
import { useTheme } from "../theme/ThemeContext";
import { AuthCardLayout, authFieldStyles as s } from "./auth/AuthCardLayout";

type Props = NativeStackScreenProps<AuthStackParamList, "ForgotPassword">;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESEND_SECONDS = 60;

export function ForgotPasswordScreen({ navigation, route }: Props) {
  const { colors } = useTheme();
  const forgot = useForgotPassword();
  const [email, setEmail] = useState(route.params?.email ?? "");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const send = () => {
    const trimmed = email.trim().toLowerCase();
    if (!EMAIL_REGEX.test(trimmed)) return setError("Enter a valid email address.");
    setError("");
    forgot.mutate(trimmed, {
      onSuccess: () => {
        setSent(true);
        setWait(RESEND_SECONDS);
      },
      onError: () => setError("Couldn't send right now. Check your connection and try again."),
    });
  };

  return (
    <AuthCardLayout
      title={sent ? "Check your email" : "Forgot password?"}
      subtitle={sent ? undefined : "Enter the email you signed up with and we'll send you a link to choose a new password."}
      onBack={() => navigation.goBack()}
    >
      {sent ? (
        <Text style={{ color: colors.ink, fontSize: 15, lineHeight: 22 }}>
          If that email has an account, we've sent a link to reset your password. It expires in 30 minutes.
        </Text>
      ) : (
        <View style={[s.field, { backgroundColor: colors.fieldBg, borderColor: colors.border }]}>
          <MaterialCommunityIcons name="email-outline" size={18} color={colors.muted} />
          <TextInput
            style={[s.input, { color: colors.ink }]}
            placeholder="Email"
            placeholderTextColor={colors.mutedLight}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            onSubmitEditing={send}
          />
        </View>
      )}
      {!!error && <Text style={[s.error, { color: colors.danger }]}>{error}</Text>}
      <TouchableOpacity
        style={[s.button, { backgroundColor: colors.primary, opacity: forgot.isPending || wait > 0 ? 0.6 : 1 }]}
        onPress={send}
        disabled={forgot.isPending || wait > 0}
        accessibilityRole="button"
      >
        {forgot.isPending ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={s.buttonText}>{sent ? (wait > 0 ? `Resend in ${wait}s` : "Resend link") : "Send reset link"}</Text>
        )}
      </TouchableOpacity>
      <TouchableOpacity style={s.link} onPress={() => navigation.navigate("Login")} accessibilityRole="button">
        <Text style={[s.linkText, { color: colors.primary }]}>Back to login</Text>
      </TouchableOpacity>
    </AuthCardLayout>
  );
}
