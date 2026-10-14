import type { ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { RADIUS, SHADOW } from "../../theme/tokens";
import { useTheme } from "../../theme/ThemeContext";

export function Card({ children, style }: { children?: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: RADIUS.card,
    borderWidth: 1,
    padding: 16,
    gap: 12,
    ...SHADOW.card,
  },
});
