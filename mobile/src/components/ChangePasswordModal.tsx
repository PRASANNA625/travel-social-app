import { useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useChangePassword } from "../api/auth";
import { useTheme } from "../theme/ThemeContext";
import { RADIUS } from "../theme/tokens";
import { Alert } from "../utils/alert";

export function ChangePasswordModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  const change = useChangePassword();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (visible) {
      setCurrent("");
      setNext("");
      setConfirm("");
      setError("");
    }
  }, [visible]);

  const save = () => {
    if (!current) return setError("Enter your current password.");
    if (next.length < 8) return setError("Use at least 8 characters for the new password.");
    if (next !== confirm) return setError("New passwords don't match.");
    setError("");
    change.mutate(
      { currentPassword: current, newPassword: next },
      {
        onSuccess: () => {
          onClose();
          Alert.alert("Password changed", "You've been signed out on your other devices.");
        },
        onError: (err: any) => setError(err?.response?.data?.error ?? "Couldn't change your password. Try again."),
      }
    );
  };

  const input = (value: string, onChange: (v: string) => void, placeholder: string, autoComplete: "current-password" | "new-password") => (
    <TextInput
      style={[styles.input, { color: colors.ink, backgroundColor: colors.fieldBg, borderColor: colors.border }]}
      placeholder={placeholder}
      placeholderTextColor={colors.mutedLight}
      secureTextEntry
      autoComplete={autoComplete}
      value={value}
      onChangeText={onChange}
      onSubmitEditing={save}
    />
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={[styles.backdrop, { backgroundColor: colors.overlay }]} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: colors.surfaceElevated }]} onPress={() => {}}>
          <Text style={[styles.title, { color: colors.ink }]}>Change password</Text>
          {input(current, setCurrent, "Current password", "current-password")}
          {input(next, setNext, "New password", "new-password")}
          {input(confirm, setConfirm, "Confirm new password", "new-password")}
          {!!error && <Text style={{ color: colors.danger, fontSize: 13 }}>{error}</Text>}
          <View style={styles.row}>
            <TouchableOpacity style={[styles.button, { borderColor: colors.border, borderWidth: 1 }]} onPress={onClose} accessibilityRole="button">
              <Text style={{ color: colors.ink, fontWeight: "700" }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, { backgroundColor: colors.primary, opacity: change.isPending ? 0.6 : 1 }]}
              onPress={save}
              disabled={change.isPending}
              accessibilityRole="button"
            >
              {change.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700" }}>Save</Text>}
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "center", padding: 16 },
  sheet: { width: "100%", maxWidth: 420, alignSelf: "center", borderRadius: RADIUS.card, padding: 20, gap: 12 },
  title: { fontSize: 18, fontWeight: "800" },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  row: { flexDirection: "row", gap: 10, marginTop: 4 },
  button: { flex: 1, borderRadius: 12, paddingVertical: 13, alignItems: "center", justifyContent: "center" },
});
