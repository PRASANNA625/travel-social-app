import { useMemo, type ComponentProps } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { RADIUS } from "../theme/tokens";
import { useTheme } from "../theme/ThemeContext";
import type { Palette } from "../theme/palettes";

type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

export interface ViewModeToggleOption<T extends string> {
  value: T;
  icon: IconName;
  label: string;
}

export function ViewModeToggle<T extends string>({
  options,
  value,
  onChange,
  size = "full",
}: {
  options: [ViewModeToggleOption<T>, ViewModeToggleOption<T>];
  value: T;
  onChange: (value: T) => void;
  size?: "full" | "compact";
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const compact = size === "compact";

  return (
    <View style={[styles.row, compact && styles.rowCompact]}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <TouchableOpacity
            key={option.value}
            style={[styles.button, compact && styles.buttonCompact, active && styles.buttonActive]}
            onPress={() => onChange(option.value)}
            activeOpacity={0.75}
          >
            <MaterialCommunityIcons
              name={option.icon}
              size={compact ? 13 : 15}
              color={active ? colors.white : colors.ink}
            />
            <Text style={[styles.buttonText, compact && styles.buttonTextCompact, active && styles.buttonTextActive]}>
              {option.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function createStyles(colors: Palette) {
  return StyleSheet.create({
    row: {
      flexDirection: "row",
      backgroundColor: colors.fieldBg,
      borderRadius: RADIUS.pill,
      padding: 3,
      gap: 3,
    },
    rowCompact: {
      alignSelf: "flex-start",
      borderWidth: 1,
      borderColor: colors.border,
    },
    button: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 5,
      paddingVertical: 8,
      borderRadius: RADIUS.pill,
    },
    buttonCompact: {
      flex: 0,
      gap: 4,
      paddingVertical: 6,
      paddingHorizontal: 10,
    },
    buttonActive: { backgroundColor: colors.primary },
    buttonText: { fontSize: 12.5, fontWeight: "700", color: colors.ink },
    buttonTextCompact: { fontSize: 11.5 },
    buttonTextActive: { color: colors.white },
  });
}
