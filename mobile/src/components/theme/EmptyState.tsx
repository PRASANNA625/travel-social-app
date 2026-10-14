import type { ComponentProps } from "react";
import { StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { FONT } from "../../theme/tokens";
import { useTheme } from "../../theme/ThemeContext";
import { PrimaryButton } from "./PrimaryButton";

type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

// Shared "nothing here yet" block: icon in a soft circle, title, message and an
// optional action.
export function EmptyState({
  icon,
  title,
  message,
  actionLabel,
  onAction,
}: {
  icon: IconName;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.wrap}>
      <View style={[styles.iconCircle, { backgroundColor: colors.primaryMuted }]}>
        <MaterialCommunityIcons name={icon} size={30} color={colors.primary} />
      </View>
      <Text style={[styles.title, { color: colors.ink }]}>{title}</Text>
      {message ? <Text style={[styles.message, { color: colors.muted }]}>{message}</Text> : null}
      {actionLabel && onAction ? (
        <PrimaryButton label={actionLabel} onPress={onAction} size="small" style={styles.action} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", paddingHorizontal: 24, paddingVertical: 48 },
  iconCircle: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center" },
  title: { ...FONT.cardTitle, marginTop: 14, textAlign: "center" },
  message: { ...FONT.bodySmall, marginTop: 6, textAlign: "center", maxWidth: 360, lineHeight: 20 },
  action: { marginTop: 18, alignSelf: "center" },
});
