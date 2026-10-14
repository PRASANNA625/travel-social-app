import type { ComponentProps, ReactNode } from "react";
import { StyleSheet, Text, TouchableOpacity } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { CONTROL, RADIUS } from "../../theme/tokens";
import { useTheme } from "../../theme/ThemeContext";

type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

// Pill toggle for horizontal filter rows (Discover categories, Meetups filters, tabs).
export function FilterChip({
  label,
  icon,
  iconColor,
  active,
  onPress,
  trailing,
}: {
  label: string;
  icon?: IconName;
  // Icon tint while inactive (defaults to the brand color).
  iconColor?: string;
  active: boolean;
  onPress: () => void;
  trailing?: ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity
      style={[
        styles.chip,
        { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
        active && { backgroundColor: colors.primary, borderColor: colors.primary },
      ]}
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      {icon && <MaterialCommunityIcons name={icon} size={15} color={active ? colors.white : iconColor ?? colors.primary} />}
      <Text style={[styles.label, { color: colors.ink }, active && { color: colors.white, fontWeight: "700" }]}>
        {label}
      </Text>
      {trailing}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: CONTROL.chip,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 14,
    borderWidth: 1,
  },
  label: { fontSize: 13, fontWeight: "500" },
});
