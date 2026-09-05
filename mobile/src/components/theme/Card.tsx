import type { ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { COLORS, RADIUS, SHADOW } from "../../theme/tokens";

export function Card({ children, style }: { children?: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.cardBg,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    padding: 18,
    gap: 12,
    ...SHADOW.card,
  },
});
