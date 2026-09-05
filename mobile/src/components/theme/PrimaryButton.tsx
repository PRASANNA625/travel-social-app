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
}: {
  label: string;
  onPress: () => void;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <TouchableOpacity
      style={[styles.button, disabled && styles.buttonDisabled, style]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.9}
    >
      {loading ? (
        <ActivityIndicator color={COLORS.white} />
      ) : (
        <>
          <Text style={styles.text}>{label}</Text>
          {icon && <MaterialCommunityIcons name={icon} size={18} color={COLORS.white} />}
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
  buttonDisabled: { opacity: 0.6 },
  text: { color: COLORS.white, fontSize: 16, fontWeight: "700" },
});
