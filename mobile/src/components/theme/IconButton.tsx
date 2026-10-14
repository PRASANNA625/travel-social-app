import type { ComponentProps } from "react";
import { Platform, Pressable, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { CONTROL } from "../../theme/tokens";
import { useTheme } from "../../theme/ThemeContext";

type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

// Eases the hover/press change on web; ignored on native.
const TRANSITION =
  Platform.OS === "web"
    ? ({ transitionProperty: "transform, box-shadow, background-color", transitionDuration: "160ms" } as object)
    : null;

// Round, bordered icon-only button used in headers and toolbars (back, settings, more...).
export function IconButton({
  icon,
  label,
  onPress,
  size = CONTROL.iconButton,
  color,
  style,
}: {
  icon: IconName;
  // Accessible name; icon-only buttons have no visible text.
  label: string;
  onPress: () => void;
  size?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      // react-native-web adds `hovered` to the state.
      style={(state) => [
        styles.button,
        { width: size, height: size, borderRadius: size / 2 },
        { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
        TRANSITION,
        (state as { hovered?: boolean }).hovered && [styles.hovered, { backgroundColor: colors.fieldBg }],
        state.pressed && styles.pressed,
        style,
      ]}
    >
      <MaterialCommunityIcons name={icon} size={Math.round(size * 0.5)} color={color ?? colors.ink} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { alignItems: "center", justifyContent: "center", borderWidth: 1 },
  hovered: {
    shadowColor: "#0f172a",
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  pressed: { transform: [{ scale: 0.94 }], opacity: 0.9 },
});
