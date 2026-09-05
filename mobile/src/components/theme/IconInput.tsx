import type { ComponentProps, ReactNode } from "react";
import { StyleSheet, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { COLORS, RADIUS } from "../../theme/tokens";

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
  return (
    <View
      style={[
        styles.wrap,
        textInputProps.multiline && styles.wrapMultiline,
        error && styles.wrapError,
        style,
      ]}
    >
      <MaterialCommunityIcons
        name={icon}
        size={18}
        color={COLORS.muted}
        style={textInputProps.multiline ? styles.iconMultiline : undefined}
      />
      <TextInput
        style={[styles.input, textInputProps.multiline && styles.inputMultiline]}
        placeholderTextColor={COLORS.mutedLight}
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
    backgroundColor: COLORS.fieldBg,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.field,
    paddingHorizontal: 14,
  },
  wrapMultiline: { alignItems: "flex-start", paddingVertical: 12 },
  wrapError: { borderColor: COLORS.danger },
  input: { flex: 1, paddingVertical: 13, fontSize: 15, color: COLORS.ink },
  inputMultiline: { minHeight: 80, textAlignVertical: "top", paddingVertical: 0 },
  iconMultiline: { marginTop: 3 },
});
