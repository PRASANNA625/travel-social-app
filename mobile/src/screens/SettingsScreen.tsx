import { useMemo, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { ScreenHeader } from "../components/theme/ScreenHeader";
import { useResponsiveLayout } from "../theme/layout";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AppStackParamList } from "../navigation/types";
import { useTheme, type ThemePreference } from "../theme/ThemeContext";
import type { Palette } from "../theme/palettes";
import { PAGE_WIDTH, RADIUS, SHADOW, pageGutter } from "../theme/tokens";
import { useMe } from "../api/users";
import { useForgotPassword } from "../api/auth";
import { ChangePasswordModal } from "../components/ChangePasswordModal";
import { Alert } from "../utils/alert";

type Props = NativeStackScreenProps<AppStackParamList, "Settings">;

const THEME_OPTIONS: { value: ThemePreference; label: string; icon: "white-balance-sunny" | "moon-waning-crescent" | "theme-light-dark" }[] = [
  { value: "light", label: "Light", icon: "white-balance-sunny" },
  { value: "dark", label: "Dark", icon: "moon-waning-crescent" },
  { value: "system", label: "System Default", icon: "theme-light-dark" },
];

export function SettingsScreen({ navigation }: Props) {
  const { colors, preference, setPreference } = useTheme();
  const { isDesktop } = useResponsiveLayout();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { data: me } = useMe();
  const forgot = useForgotPassword();
  const [changingPassword, setChangingPassword] = useState(false);
  // Accounts with a password change it here; Google-only accounts get an emailed link to set one.
  const onPasswordRow = () => {
    if (me?.hasPassword !== false) return setChangingPassword(true);
    if (!me.email) return Alert.alert("No email on this account", "Add an email address to your profile first.");
    forgot.mutate(me.email, {
      onSuccess: () => Alert.alert("Check your email", `We've sent a link to ${me.email} to set your password.`),
      onError: () => Alert.alert("Couldn't send the email", "Try again in a moment."),
    });
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Settings" showBack maxWidth={PAGE_WIDTH.form} />

      <View style={[styles.body, { paddingHorizontal: pageGutter(isDesktop) }]}>
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

        <Text style={[styles.sectionTitle, styles.sectionTitleSpaced]}>Account</Text>
        <View style={styles.card}>
          <TouchableOpacity style={styles.row} onPress={onPasswordRow} disabled={forgot.isPending} accessibilityRole="button">
            <View style={styles.iconWrap}>
              <MaterialCommunityIcons name="lock-reset" size={18} color={colors.muted} />
            </View>
            <Text style={styles.rowLabel}>{me?.hasPassword === false ? "Set a password" : "Change password"}</Text>
            <MaterialCommunityIcons name="chevron-right" size={20} color={colors.mutedLight} />
          </TouchableOpacity>
        </View>

        <Text style={[styles.sectionTitle, styles.sectionTitleSpaced]}>Privacy & Safety</Text>
        <View style={styles.card}>
          <TouchableOpacity style={styles.row} onPress={() => navigation.navigate("BlockedUsers")}>
            <View style={styles.iconWrap}>
              <MaterialCommunityIcons name="account-off-outline" size={18} color={colors.muted} />
            </View>
            <Text style={styles.rowLabel}>Blocked Users</Text>
            <MaterialCommunityIcons name="chevron-right" size={20} color={colors.mutedLight} />
          </TouchableOpacity>
        </View>
      </View>
      <ChangePasswordModal visible={changingPassword} onClose={() => setChangingPassword(false)} />
    </View>
  );
}

function createStyles(colors: Palette) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.surface },
    body: { width: "100%", maxWidth: PAGE_WIDTH.form, alignSelf: "center", paddingTop: 8, paddingBottom: 32 },
    sectionTitle: { fontSize: 13, fontWeight: "700", color: colors.muted, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.4 },
    sectionTitleSpaced: { marginTop: 24 },
    card: {
      backgroundColor: colors.surfaceElevated,
      borderRadius: RADIUS.card,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: "hidden",
      ...SHADOW.card,
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
