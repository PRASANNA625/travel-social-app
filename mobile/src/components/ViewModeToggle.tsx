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
  iconOnly = false,
}: {
  options: readonly ViewModeToggleOption<T>[];
  value: T;
  onChange: (value: T) => void;
  // "segmented": borderless buttons meant to sit inside a caller-provided pill.
  size?: "full" | "compact" | "segmented";
  // Hide the labels (they become accessibility labels) where space is tight.
  iconOnly?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const compact = size === "compact";
  const segmented = size === "segmented";

  return (
    <View style={segmented ? styles.rowSegmented : compact ? styles.rowCompact : styles.row}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <TouchableOpacity
            key={option.value}
            style={[
              segmented ? styles.buttonSegmented : compact ? styles.buttonCompact : styles.button,
              active && (compact || segmented ? styles.buttonCompactActive : styles.buttonActive),
            ]}
            onPress={() => onChange(option.value)}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={option.label}
          >
            <MaterialCommunityIcons
              name={option.icon}
              size={segmented ? 16 : compact ? 13 : 15}
              color={active ? colors.white : colors.ink}
            />
            {!iconOnly && (
              <Text
                style={[
                  segmented ? styles.buttonTextSegmented : compact ? styles.buttonTextCompact : styles.buttonText,
                  active && styles.buttonTextActive,
                ]}
              >
                {option.label}
              </Text>
            )}
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
      flexDirection: "row",
      alignSelf: "flex-start",
      backgroundColor: colors.fieldBg,
      borderRadius: RADIUS.pill,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 3,
      gap: 3,
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
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 4,
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderRadius: RADIUS.pill,
      backgroundColor: "transparent",
    },
    rowSegmented: { flexDirection: "row", gap: 2 },
    buttonSegmented: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      height: 34,
      paddingHorizontal: 12,
      borderRadius: RADIUS.pill,
    },
    buttonTextSegmented: { fontSize: 13, fontWeight: "700", color: colors.ink },
    buttonActive: { backgroundColor: colors.primary },
    buttonCompactActive: { backgroundColor: colors.primary },
    buttonText: { fontSize: 12.5, fontWeight: "700", color: colors.ink },
    buttonTextCompact: { fontSize: 11.5, fontWeight: "700", color: colors.ink },
    buttonTextActive: { color: colors.white },
  });
}
