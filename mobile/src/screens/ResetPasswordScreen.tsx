import { useState } from "react";
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useResetPassword } from "../api/auth";
import { useTheme } from "../theme/ThemeContext";
import { Alert } from "../utils/alert";
import { AuthCardLayout, authFieldStyles as s } from "./auth/AuthCardLayout";

// Shown by RootNavigator when the app was opened from a reset email (signed in or not).
// onClose(requestNew) hands control back; requestNew opens Forgot password.
export function ResetPasswordScreen({ token, onClose }: { token: string; onClose: (requestNew?: boolean) => void }) {
  const { colors } = useTheme();
  const reset = useResetPassword();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [linkInvalid, setLinkInvalid] = useState(false);

  const save = () => {
    if (password.length < 8) return setError("Use at least 8 characters.");
    if (password !== confirm) return setError("Passwords don't match");
    setError("");
    reset.mutate(
      { token, password },
      {
        onSuccess: () => {
          onClose();
          Alert.alert("Password updated", "You're signed in with your new password.");
        },
        onError: (err: any) => {
          if (err?.response?.data?.code === "RESET_TOKEN_INVALID") setLinkInvalid(true);
          setError(err?.response?.data?.error ?? "Couldn't update your password. Try again.");
        },
      }
    );
  };

  const field = (value: string, onChange: (v: string) => void, placeholder: string) => (
    <View style={[s.field, { backgroundColor: colors.fieldBg, borderColor: colors.border }]}>
      <MaterialCommunityIcons name="lock-outline" size={18} color={colors.muted} />
      <TextInput
        style={[s.input, { color: colors.ink }]}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedLight}
        secureTextEntry={!show}
        autoComplete="new-password"
        value={value}
        onChangeText={onChange}
        onSubmitEditing={save}
      />
      <TouchableOpacity onPress={() => setShow((v) => !v)} hitSlop={8} accessibilityLabel={show ? "Hide password" : "Show password"}>
        <MaterialCommunityIcons name={show ? "eye-off-outline" : "eye-outline"} size={19} color={colors.muted} />
      </TouchableOpacity>
    </View>
  );

  return (
    <AuthCardLayout title="Choose a new password" subtitle="Use at least 8 characters. You'll be signed out on your other devices.">
      {field(password, setPassword, "New password")}
      {field(confirm, setConfirm, "Confirm new password")}
      {!!error && <Text style={[s.error, { color: colors.danger }]}>{error}</Text>}
      {linkInvalid ? (
        <TouchableOpacity style={[s.button, { backgroundColor: colors.primary }]} onPress={() => onClose(true)} accessibilityRole="button">
          <Text style={s.buttonText}>Request a new link</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={[s.button, { backgroundColor: colors.primary, opacity: reset.isPending ? 0.6 : 1 }]}
          onPress={save}
          disabled={reset.isPending}
          accessibilityRole="button"
        >
          {reset.isPending ? <ActivityIndicator color="#fff" /> : <Text style={s.buttonText}>Save new password</Text>}
        </TouchableOpacity>
      )}
      <TouchableOpacity style={s.link} onPress={() => onClose()} accessibilityRole="button">
        <Text style={[s.linkText, { color: colors.primary }]}>Cancel</Text>
      </TouchableOpacity>
    </AuthCardLayout>
  );
}
