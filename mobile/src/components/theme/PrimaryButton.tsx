import type { ComponentProps } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, type StyleProp, type ViewStyle } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { CONTROL, FONT, RADIUS, SHADOW } from "../../theme/tokens";
import { useTheme } from "../../theme/ThemeContext";

type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

export function PrimaryButton({
  label,
  onPress,
  icon,
  loading,
  disabled,
  style,
  variant = "solid",
  size = "regular",
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  variant?: "solid" | "outline";
  // "small" for inline actions (empty states, cards); "regular" for forms and page actions.
  size?: "regular" | "small";
  // When the visible label is shortened (e.g. on phones).
  accessibilityLabel?: string;
}) {
  const { colors } = useTheme();
  const isOutline = variant === "outline";
  const contentColor = isOutline ? colors.primary : colors.white;

  return (
    <TouchableOpacity
      style={[
        styles.button,
        size === "small" && styles.buttonSmall,
        { backgroundColor: colors.primary, shadowColor: colors.primary },
        isOutline && [styles.buttonOutline, { backgroundColor: colors.surfaceElevated, borderColor: colors.primary }],
        disabled && styles.buttonDisabled,
        style,
      ]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.9}
      accessibilityLabel={accessibilityLabel}
    >
      {loading ? (
        <ActivityIndicator color={contentColor} />
      ) : (
        <>
          <Text
            style={[styles.text, size === "small" && styles.textSmall, { color: colors.white }, isOutline && { color: colors.primary }]}
          >
            {label}
          </Text>
          {icon && <MaterialCommunityIcons name={icon} size={18} color={contentColor} />}
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: CONTROL.button,
    borderRadius: RADIUS.field,
    paddingHorizontal: 20,
    ...SHADOW.button,
  },
  buttonSmall: { minHeight: CONTROL.buttonSmall, paddingHorizontal: 16, borderRadius: RADIUS.sm },
  buttonOutline: {
    borderWidth: 1.5,
    shadowColor: "transparent",
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  buttonDisabled: { opacity: 0.6 },
  text: { ...FONT.button, flexShrink: 1 },
  textSmall: { fontSize: 14 },
});
