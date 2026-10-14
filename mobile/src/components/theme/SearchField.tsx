import type { ComponentProps } from "react";
import { StyleSheet, TextInput, TouchableOpacity, View, type StyleProp, type ViewStyle } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { RADIUS } from "../../theme/tokens";
import { useTheme } from "../../theme/ThemeContext";

type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

// Pill-shaped search/filter input with a clear button, used for in-page search.
export function SearchField({
  value,
  onChangeText,
  placeholder,
  icon = "magnify",
  style,
}: {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.wrap, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }, style]}>
      <MaterialCommunityIcons name={icon} size={19} color={colors.mutedLight} />
      <TextInput
        style={[styles.input, { color: colors.ink }]}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedLight}
        value={value}
        onChangeText={onChangeText}
        accessibilityLabel={placeholder}
      />
      {value.length > 0 && (
        <TouchableOpacity onPress={() => onChangeText("")} hitSlop={8} accessibilityLabel="Clear">
          <MaterialCommunityIcons name="close-circle" size={18} color={colors.mutedLight} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    height: 44,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    paddingHorizontal: 16,
  },
  input: { flex: 1, minWidth: 0, height: "100%", fontSize: 14.5 },
});
