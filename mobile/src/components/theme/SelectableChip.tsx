import type { ComponentProps } from "react";
import { StyleSheet, Text, TouchableOpacity, type StyleProp, type ViewStyle } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { COLORS, RADIUS } from "../../theme/tokens";

type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

export function SelectableChip({
  icon,
  label,
  active,
  onPress,
  style,
}: {
  icon?: IconName;
  label: string;
  active: boolean;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <TouchableOpacity style={[styles.chip, active && styles.chipActive, style]} onPress={onPress} activeOpacity={0.85}>
      {icon && <MaterialCommunityIcons name={icon} size={16} color={active ? COLORS.white : COLORS.muted} />}
      <Text style={[styles.label, active && styles.labelActive]} numberOfLines={2}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: COLORS.fieldBg,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.chip,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  label: { fontSize: 12.5, color: COLORS.ink, fontWeight: "600", textAlign: "center" },
  labelActive: { color: COLORS.white, fontWeight: "700" },
});
