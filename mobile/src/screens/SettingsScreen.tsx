import { useMemo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AppStackParamList } from "../navigation/types";
import { useTheme, type ThemePreference } from "../theme/ThemeContext";
import type { Palette } from "../theme/palettes";
import { RADIUS } from "../theme/tokens";

type Props = NativeStackScreenProps<AppStackParamList, "Settings">;

const THEME_OPTIONS: { value: ThemePreference; label: string; icon: "white-balance-sunny" | "moon-waning-crescent" | "theme-light-dark" }[] = [
  { value: "light", label: "Light", icon: "white-balance-sunny" },
  { value: "dark", label: "Dark", icon: "moon-waning-crescent" },
  { value: "system", label: "System Default", icon: "theme-light-dark" },
];

export function SettingsScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { colors, preference, setPreference } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity style={styles.headerButton} onPress={() => navigation.goBack()}>
          <MaterialCommunityIcons name="arrow-left" size={20} color={colors.ink} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          Settings
        </Text>
        <View style={styles.headerButton} />
      </View>

      <View style={styles.body}>
        <Text style={styles.sectionTitle}>Appearance</Text>
        <View style={styles.card}>
          {THEME_OPTIONS.map((option, index) => {
            const active = preference === option.value;
            return (
              <TouchableOpacity
                key={option.value}
                style={[styles.row, index < THEME_OPTIONS.length - 1 && styles.rowDivider]}
                onPress={() => setPreference(option.value)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <View style={[styles.iconWrap, active && styles.iconWrapActive]}>
                  <MaterialCommunityIcons name={option.icon} size={18} color={active ? colors.white : colors.muted} />
                </View>
                <Text style={styles.rowLabel}>{option.label}</Text>
                {active && <MaterialCommunityIcons name="check-circle" size={20} color={colors.primary} />}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </View>
  );
}

function createStyles(colors: Palette) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.surface },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 12,
      paddingBottom: 10,
      backgroundColor: colors.surfaceElevated,
      borderBottomWidth: 1,
      borderBottomColor: colors.divider,
    },
    headerButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.fieldBg,
    },
    headerTitle: { flex: 1, textAlign: "center", fontSize: 16, fontWeight: "700", color: colors.ink },
    body: { padding: 16 },
    sectionTitle: { fontSize: 13, fontWeight: "700", color: colors.muted, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.4 },
    card: {
      backgroundColor: colors.surfaceElevated,
      borderRadius: RADIUS.card,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      overflow: "hidden",
    },
    row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, paddingHorizontal: 16 },
    rowDivider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
    iconWrap: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.fieldBg,
      alignItems: "center",
      justifyContent: "center",
    },
    iconWrapActive: { backgroundColor: colors.primary },
    rowLabel: { flex: 1, fontSize: 15, fontWeight: "600", color: colors.ink },
  });
}
