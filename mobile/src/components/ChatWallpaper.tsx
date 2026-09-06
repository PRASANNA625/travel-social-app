import type { ComponentProps } from "react";
import { StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { GRADIENT_PRIMARY } from "../theme/tokens";

type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

const ICONS: IconName[] = ["airplane", "map-marker-outline", "bag-checked", "image-filter-hdr", "earth", "car-side"];
const TEAL = "#0f766e";
const BLUE = "#1d4ed8";
const COLS = 5;
const ROWS = 7;

type PatternItem = { left: `${number}%`; top: `${number}%`; icon: IconName; size: number; rotate: string; color: string };

const PATTERN: PatternItem[] = (() => {
  const items: PatternItem[] = [];
  for (let row = 0; row < ROWS; row++) {
    const rowOffset = row % 2 === 0 ? 0 : 10;
    for (let col = 0; col < COLS; col++) {
      const index = (row * COLS + col) % ICONS.length;
      items.push({
        left: `${rowOffset + col * 20}%`,
        top: `${row * (100 / ROWS)}%`,
        icon: ICONS[index],
        size: 18 + (index % 3) * 3,
        rotate: `${(index % 2 === 0 ? -1 : 1) * (8 + index * 3)}deg`,
        color: index % 2 === 0 ? TEAL : BLUE,
      });
    }
  }
  return items;
})();

// Subtle WhatsApp-style chat wallpaper: a faint Triply gradient wash plus a
// low-opacity repeating grid of travel icons, matching the watermark pattern
// already used in GradientBackground. Purely decorative - never intercepts touches.
export function ChatWallpaper() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient
        colors={GRADIENT_PRIMARY.colors}
        locations={GRADIENT_PRIMARY.locations}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[StyleSheet.absoluteFill, styles.wash]}
      />
      {PATTERN.map((item, i) => (
        <MaterialCommunityIcons
          key={i}
          name={item.icon}
          size={item.size}
          color={item.color}
          style={[styles.icon, { left: item.left, top: item.top, transform: [{ rotate: item.rotate }] }]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wash: { opacity: 0.035 },
  icon: { position: "absolute", opacity: 0.09 },
});
