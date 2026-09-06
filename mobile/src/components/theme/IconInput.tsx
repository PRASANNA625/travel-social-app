import type { ComponentProps, ReactNode } from "react";
import { StyleSheet, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { RADIUS } from "../../theme/tokens";
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
  return (
    <View
      style={[
        styles.wrap,
        { backgroundColor: colors.fieldBg, borderColor: colors.border },
        textInputProps.multiline && styles.wrapMultiline,
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
  },
  wrapMultiline: { alignItems: "flex-start", paddingVertical: 12 },
  input: { flex: 1, paddingVertical: 13, fontSize: 15 },
  inputMultiline: { minHeight: 80, textAlignVertical: "top", paddingVertical: 0 },
  iconMultiline: { marginTop: 3 },
});
