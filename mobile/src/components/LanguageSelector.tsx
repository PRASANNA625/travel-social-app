import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LANGUAGES } from "../i18n/languages";
import { useLanguage } from "../i18n/LanguageContext";

export function LanguageSelector({
  variant = "light",
  style,
}: {
  variant?: "light" | "dark";
  style?: StyleProp<ViewStyle>;
}) {
  const { language, setLanguage } = useLanguage();
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const isLight = variant === "light";
  const current = LANGUAGES.find((l) => l.code === language) ?? LANGUAGES[0];

  return (
    <>
      <TouchableOpacity
        style={[styles.pill, isLight ? styles.pillLight : styles.pillDark, style]}
        onPress={() => setOpen(true)}
      >
        <Text style={[styles.pillText, isLight ? styles.pillTextLight : styles.pillTextDark]}>{current.native}</Text>
        <MaterialCommunityIcons name="chevron-down" size={14} color={isLight ? "#fff" : "#0f172a"} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <View style={[styles.sheet, { marginTop: insets.top + 60 }]}>
            {LANGUAGES.map((l) => (
              <TouchableOpacity
                key={l.code}
                style={[styles.option, l.code === language && styles.optionActive]}
                onPress={() => {
                  setLanguage(l.code);
                  setOpen(false);
                }}
              >
                <Text style={[styles.optionText, l.code === language && styles.optionTextActive]}>{l.native}</Text>
                {l.code === language && <MaterialCommunityIcons name="check" size={16} color="#0f766e" />}
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
  },
  pillLight: { backgroundColor: "rgba(255,255,255,0.16)", borderColor: "rgba(255,255,255,0.3)" },
  pillDark: { backgroundColor: "#f8fafc", borderColor: "#e2e8f0" },
  pillText: { fontSize: 12.5, fontWeight: "700" },
  pillTextLight: { color: "#fff" },
  pillTextDark: { color: "#0f172a" },
  backdrop: { flex: 1, backgroundColor: "rgba(15,23,42,0.4)", alignItems: "flex-end", paddingHorizontal: 20 },
  sheet: {
    width: 180,
    backgroundColor: "#fff",
    borderRadius: 16,
    paddingVertical: 6,
    shadowColor: "#0f172a",
    shadowOpacity: 0.2,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  option: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12 },
  optionActive: { backgroundColor: "#ecfdf5" },
  optionText: { fontSize: 14, color: "#334155", fontWeight: "500" },
  optionTextActive: { color: "#0f766e", fontWeight: "700" },
});
