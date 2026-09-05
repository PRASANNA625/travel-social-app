import type { ComponentProps } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, type StyleProp, type ViewStyle } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { COLORS, RADIUS, SHADOW } from "../../theme/tokens";

type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

export function PrimaryButton({
  label,
  onPress,
  icon,
  loading,
  disabled,
  style,
  variant = "solid",
}: {
  label: string;
  onPress: () => void;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  variant?: "solid" | "outline";
}) {
  const isOutline = variant === "outline";
  const contentColor = isOutline ? COLORS.primary : COLORS.white;

  return (
    <TouchableOpacity
      style={[styles.button, isOutline && styles.buttonOutline, disabled && styles.buttonDisabled, style]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.9}
    >
      {loading ? (
        <ActivityIndicator color={contentColor} />
      ) : (
        <>
          <Text style={[styles.text, isOutline && styles.textOutline]}>{label}</Text>
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
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.field,
    paddingVertical: 15,
    ...SHADOW.button,
  },
  buttonOutline: {
    backgroundColor: COLORS.white,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    shadowColor: "transparent",
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  buttonDisabled: { opacity: 0.6 },
  text: { color: COLORS.white, fontSize: 16, fontWeight: "700" },
  textOutline: { color: COLORS.primary },
});
