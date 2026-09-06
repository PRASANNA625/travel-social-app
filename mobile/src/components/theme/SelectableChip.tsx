import type { ComponentProps } from "react";
import { StyleSheet, Text, TouchableOpacity, type StyleProp, type ViewStyle } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { RADIUS } from "../../theme/tokens";
import { useTheme } from "../../theme/ThemeContext";

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
  const { colors } = useTheme();
  return (
    <TouchableOpacity
      style={[
        styles.chip,
        { backgroundColor: colors.fieldBg, borderColor: colors.border },
        active && { backgroundColor: colors.primary, borderColor: colors.primary },
        style,
      ]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      {icon && <MaterialCommunityIcons name={icon} size={16} color={active ? colors.white : colors.muted} />}
      <Text
        style={[styles.label, { color: colors.ink }, active && { color: colors.white, fontWeight: "700" }]}
        numberOfLines={2}
      >
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
    borderWidth: 1,
    borderRadius: RADIUS.chip,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  label: { fontSize: 12.5, fontWeight: "600", textAlign: "center" },
});
