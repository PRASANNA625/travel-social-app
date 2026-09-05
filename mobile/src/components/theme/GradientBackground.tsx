import type { ReactNode } from "react";
import { StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { GRADIENT_PRIMARY } from "../../theme/tokens";

export function GradientBackground({
  children,
  style,
}: {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <LinearGradient
      colors={GRADIENT_PRIMARY.colors}
      locations={GRADIENT_PRIMARY.locations}
      style={[styles.gradient, style]}
    >
      <MaterialCommunityIcons name="compass-outline" size={130} color="rgba(255,255,255,0.08)" style={styles.compass} />
      {children}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: { overflow: "hidden" },
  compass: { position: "absolute", top: -20, right: -20, transform: [{ rotate: "-18deg" }] },
});
