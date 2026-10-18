import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GRADIENT_PRIMARY } from "../../theme/tokens";
import { useTheme } from "../../theme/ThemeContext";

// Gradient background and white card, matching the login screen, for the password screens.
export function AuthCardLayout({ title, subtitle, onBack, children }: { title: string; subtitle?: string; onBack?: () => void; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  return (
    <LinearGradient colors={GRADIENT_PRIMARY.colors} locations={GRADIENT_PRIMARY.locations} style={styles.flex}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled">
          <View style={[styles.card, { backgroundColor: colors.surfaceElevated }]}>
            {onBack && (
              <TouchableOpacity onPress={onBack} style={styles.back} accessibilityRole="button" accessibilityLabel="Back" hitSlop={8}>
                <MaterialCommunityIcons name="arrow-left" size={22} color={colors.ink} />
              </TouchableOpacity>
            )}
            <Text style={[styles.title, { color: colors.ink }]}>{title}</Text>
            {!!subtitle && <Text style={[styles.subtitle, { color: colors.muted }]}>{subtitle}</Text>}
            {children}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: "center", paddingHorizontal: 24 },
  card: { width: "100%", maxWidth: 420, alignSelf: "center", borderRadius: 24, padding: 24, gap: 14 },
  back: { alignSelf: "flex-start", marginBottom: -4 },
  title: { fontSize: 24, fontWeight: "800" },
  subtitle: { fontSize: 13.5, lineHeight: 19, marginTop: -6 },
});

// Shared field and button styles for the password screens.
export const authFieldStyles = StyleSheet.create({
  field: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14 },
  input: { flex: 1, paddingVertical: 14, fontSize: 15 },
  button: { borderRadius: 14, paddingVertical: 15, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  link: { alignSelf: "center", paddingVertical: 8 },
  linkText: { fontSize: 13.5, fontWeight: "600" },
  error: { fontSize: 13 },
});
