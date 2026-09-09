import { StyleSheet, TouchableOpacity, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";

const STAR_VALUES = [1, 2, 3, 4, 5] as const;

export function StarRating({
  rating,
  onChange,
  readOnly = true,
  size = 16,
}: {
  rating: number;
  onChange?: (rating: number) => void;
  readOnly?: boolean;
  size?: number;
}) {
  const { colors } = useTheme();

  return (
    <View style={styles.row}>
      {STAR_VALUES.map((value) => {
        const filled = value <= Math.round(rating);
        const icon = (
          <MaterialCommunityIcons
            name={filled ? "star" : "star-outline"}
            size={size}
            color={filled ? colors.warningText : colors.mutedLight}
          />
        );
        return readOnly ? (
          <View key={value}>{icon}</View>
        ) : (
          <TouchableOpacity
            key={value}
            onPress={() => onChange?.(value)}
            hitSlop={4}
            accessibilityRole="button"
            accessibilityLabel={`Rate ${value} star${value > 1 ? "s" : ""}`}
          >
            {icon}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 2 },
});
