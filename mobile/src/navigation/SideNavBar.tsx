import { useMemo, useState, type ComponentProps } from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { SIDEBAR_WIDTH } from "../theme/layout";
import { useTheme } from "../theme/ThemeContext";
import type { Palette } from "../theme/palettes";
import {
  ILLUSTRATION_SCENE_HEIGHT,
  ILLUSTRATION_TEXT_HEIGHT,
  SidebarIllustration,
} from "../components/SidebarIllustration";

type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

const ACTIVE_BLUE = "#2563eb";

// Desktop replacement for the bottom tab bar: same routes, badges and tabPress
// semantics, rendered as a fixed left sidebar (AppTabs offsets the scenes).
export function SideNavBar({
  state,
  descriptors,
  navigation,
  icons,
}: BottomTabBarProps & { icons: Record<string, { active: IconName; inactive: IconName }> }) {
  const { colors, scheme } = useTheme();
  const dark = scheme === "dark";
  const styles = useMemo(() => createStyles(colors, dark), [colors, dark]);
  // Space left under the menu decides how much of the illustration fits, so it
  // never overlaps the navigation on short windows.
  const [freeHeight, setFreeHeight] = useState(0);
  const showScene = freeHeight >= ILLUSTRATION_SCENE_HEIGHT + ILLUSTRATION_TEXT_HEIGHT;
  const showText = freeHeight >= ILLUSTRATION_TEXT_HEIGHT;

  return (
    <LinearGradient
      colors={dark ? [colors.surfaceElevated, colors.surfaceElevated] : ["#ffffff", "#f4f8fe", "#eaf2fc"]}
      locations={dark ? undefined : [0, 0.55, 1]}
      style={styles.sidebar}
    >
      <View style={styles.brandRow}>
        <Image source={require("../../assets/logo.png")} style={styles.brandIcon} accessibilityIgnoresInvertColors />
        <View>
          <Text style={styles.brandName}>Triply</Text>
          <Text style={styles.brandTagline}>Travel Together</Text>
        </View>
      </View>

      <View style={styles.items}>
        {state.routes.map((route, index) => {
          const focused = state.index === index;
          const { options } = descriptors[route.key];
          const label = options.title ?? route.name;
          const icon = icons[route.name];
          const badge = options.tabBarBadge;

          const onPress = () => {
            const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
          };

          return (
            <TouchableOpacity
              key={route.key}
              style={[styles.item, focused && styles.itemActive]}
              onPress={onPress}
              activeOpacity={0.75}
              accessibilityRole="link"
              accessibilityState={focused ? { selected: true } : {}}
              accessibilityLabel={badge !== undefined ? `${label}, ${badge} unread` : label}
            >
              <MaterialCommunityIcons
                name={focused ? icon.active : icon.inactive}
                size={24}
                color={focused ? ACTIVE_BLUE : colors.ink}
              />
              <Text style={[styles.itemLabel, focused && styles.itemLabelActive]}>{label}</Text>
              {badge !== undefined && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{typeof badge === "number" && badge > 99 ? "99+" : badge}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.bottom} onLayout={(e) => setFreeHeight(e.nativeEvent.layout.height)}>
        {showText && <SidebarIllustration showScene={showScene} dimmed={dark} />}
      </View>
    </LinearGradient>
  );
}

function createStyles(colors: Palette, dark: boolean) {
  return StyleSheet.create({
    sidebar: {
      position: "absolute",
      left: 0,
      top: 0,
      bottom: 0,
      width: SIDEBAR_WIDTH,
      borderRightWidth: 1,
      borderRightColor: dark ? colors.divider : "#e4ecf7",
      paddingTop: 28,
      overflow: "hidden",
    },
    brandRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 24, marginBottom: 30 },
    brandIcon: { width: 46, height: 46, borderRadius: 23 },
    brandName: { fontSize: 25, fontWeight: "800", color: dark ? colors.ink : "#0f2a4a", letterSpacing: -0.4 },
    brandTagline: { fontSize: 12.5, color: colors.mutedLight, marginTop: -1 },
    items: { gap: 6, paddingHorizontal: 14 },
    item: {
      flexDirection: "row",
      alignItems: "center",
      gap: 16,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderRadius: 14,
    },
    itemActive: { backgroundColor: dark ? "rgba(37,99,235,0.18)" : "#e6effd" },
    itemLabel: { flex: 1, fontSize: 15.5, fontWeight: "500", color: colors.ink },
    itemLabelActive: { color: dark ? "#93b4fb" : ACTIVE_BLUE, fontWeight: "700" },
    badge: {
      minWidth: 22,
      height: 22,
      paddingHorizontal: 6,
      borderRadius: 11,
      backgroundColor: "#ef4444",
      alignItems: "center",
      justifyContent: "center",
    },
    badgeText: { color: "#ffffff", fontSize: 11.5, fontWeight: "800" },
    bottom: { flex: 1, justifyContent: "flex-end", marginTop: 12 },
  });
}
