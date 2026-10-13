import { useEffect, useRef, useState, type ComponentProps } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { ACTION_BLUE, RADIUS } from "../../theme/tokens";
import { useReduceMotion } from "../../hooks/useReduceMotion";

type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

// Space a scrolling list should leave at its end so its last item can scroll
// clear of the button (button height + offset + breathing room).
export const FAB_CLEARANCE = 96;

// The app's one floating action button. Sits in the bottom-right corner of the
// screen it's rendered in (so it stays above the bottom tab bar, which lives
// outside the screen), on its own layer above the content. Pass `collapsed`
// while the user scrolls down to shrink it to its icon so it covers less.
export function FloatingActionButton({
  icon,
  label,
  onPress,
  collapsed = false,
  right,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  collapsed?: boolean;
  right: number;
}) {
  const reduceMotion = useReduceMotion();
  const [labelWidth, setLabelWidth] = useState(0);
  const expanded = useRef(new Animated.Value(collapsed ? 0 : 1)).current;

  useEffect(() => {
    const toValue = collapsed ? 0 : 1;
    if (reduceMotion) {
      expanded.setValue(toValue);
      return;
    }
    Animated.timing(expanded, {
      toValue,
      duration: 200,
      easing: Easing.out(Easing.cubic),
      // Width can't use the native driver.
      useNativeDriver: false,
    }).start();
  }, [collapsed, expanded, reduceMotion]);

  return (
    <View style={[styles.layer, { right }]} pointerEvents="box-none">
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      >
        <MaterialCommunityIcons name={icon} size={22} color="#ffffff" />
        {/* Invisible copy measures the label's natural width outside the animated clip. */}
        <View style={styles.measure} pointerEvents="none" aria-hidden>
          <Text style={[styles.label, styles.measureText]} onLayout={(e) => setLabelWidth(e.nativeEvent.layout.width)}>
            {label}
          </Text>
        </View>
        <Animated.View
          style={{
            width: expanded.interpolate({ inputRange: [0, 1], outputRange: [0, labelWidth + 2] }),
            opacity: expanded,
            overflow: "hidden",
          }}
        >
          <Text style={[styles.label, { width: labelWidth + 2 }]} numberOfLines={1}>
            {label}
          </Text>
        </Animated.View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { position: "absolute", bottom: 20, zIndex: 10 },
  button: {
    flexDirection: "row",
    alignItems: "center",
    height: 52,
    minWidth: 52,
    paddingHorizontal: 15,
    borderRadius: RADIUS.pill,
    backgroundColor: ACTION_BLUE,
    shadowColor: "#1d4ed8",
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  pressed: { opacity: 0.9, transform: [{ scale: 0.97 }] },
  label: { color: "#ffffff", fontWeight: "700", fontSize: 14.5, paddingLeft: 8, paddingRight: 4 },
  measure: { position: "absolute", opacity: 0, left: 0, top: 0, width: 600 },
  measureText: { alignSelf: "flex-start" },
});
