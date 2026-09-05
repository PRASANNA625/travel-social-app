import { useEffect, useRef } from "react";
import { Animated, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { COLORS, RADIUS } from "../../theme/tokens";

// A single pulsing placeholder block, used to build per-screen skeleton
// layouts that roughly match the real content's shape so the loading state
// doesn't look like a blank/broken screen while data is in flight.
export function Skeleton({ style }: { style?: StyleProp<ViewStyle> }) {
  const opacity = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.85, duration: 650, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.45, duration: 650, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return <Animated.View style={[styles.block, { opacity }, style]} />;
}

const styles = StyleSheet.create({
  block: { backgroundColor: COLORS.border, borderRadius: RADIUS.field },
});
