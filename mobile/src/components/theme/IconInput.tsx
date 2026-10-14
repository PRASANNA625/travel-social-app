import { useState, type ComponentProps, type ReactNode } from "react";
import { StyleSheet, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { CONTROL, RADIUS } from "../../theme/tokens";
import { useTheme } from "../../theme/ThemeContext";

type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

export function IconInput({
  icon,
  error,
  rightElement,
  style,
  ...textInputProps
}: TextInputProps & {
  icon: IconName;
  error?: boolean;
  rightElement?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  // Focus ring so the active field is easy to spot.
  const [focused, setFocused] = useState(false);
  return (
    <View
      style={[
        styles.wrap,
        { backgroundColor: colors.fieldBg, borderColor: colors.border },
        textInputProps.multiline && styles.wrapMultiline,
        focused && { borderColor: colors.primary, backgroundColor: colors.surfaceElevated },
        error && { borderColor: colors.danger },
        style,
      ]}
    >
      <MaterialCommunityIcons
        name={icon}
        size={18}
        color={colors.muted}
        style={textInputProps.multiline ? styles.iconMultiline : undefined}
      />
      <TextInput
        style={[styles.input, { color: colors.ink }, textInputProps.multiline && styles.inputMultiline]}
        placeholderTextColor={colors.mutedLight}
        {...textInputProps}
        onFocus={(e) => {
          setFocused(true);
          textInputProps.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          textInputProps.onBlur?.(e);
        }}
      />
      {rightElement}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: RADIUS.field,
    paddingHorizontal: 14,
    minHeight: CONTROL.field,
  },
  wrapMultiline: { alignItems: "flex-start", paddingVertical: 12 },
  input: { flex: 1, minWidth: 0, paddingVertical: 12, fontSize: 15 },
  inputMultiline: { minHeight: 80, textAlignVertical: "top", paddingVertical: 0 },
  iconMultiline: { marginTop: 3 },
});
