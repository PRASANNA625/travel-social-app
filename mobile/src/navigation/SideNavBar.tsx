import { useMemo, type ComponentProps } from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { SIDEBAR_WIDTH } from "../theme/layout";
import { useTheme } from "../theme/ThemeContext";
import type { Palette } from "../theme/palettes";

type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

// Desktop replacement for the bottom tab bar: same routes, badges and tabPress
// semantics, rendered as a fixed left sidebar (AppTabs offsets the scenes).
export function SideNavBar({
  state,
  descriptors,
  navigation,
  icons,
}: BottomTabBarProps & { icons: Record<string, { active: IconName; inactive: IconName }> }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.sidebar}>
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
              accessibilityRole="link"
              accessibilityState={focused ? { selected: true } : {}}
              accessibilityLabel={label}
            >
              <MaterialCommunityIcons
                name={focused ? icon.active : icon.inactive}
                size={22}
                color={focused ? colors.primary : colors.muted}
              />
              <Text style={[styles.itemLabel, focused && styles.itemLabelActive]}>{label}</Text>
              {badge !== undefined && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{badge}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.footer}>
        <MaterialCommunityIcons name="airplane-takeoff" size={26} color={colors.primary} />
        <Text style={styles.footerText}>New journeys bring new people and stories</Text>
      </View>
    </View>
  );
}

function createStyles(colors: Palette) {
  return StyleSheet.create({
    sidebar: {
      position: "absolute",
      left: 0,
      top: 0,
      bottom: 0,
      width: SIDEBAR_WIDTH,
      backgroundColor: colors.surfaceElevated,
      borderRightWidth: 1,
      borderRightColor: colors.divider,
      paddingHorizontal: 14,
      paddingTop: 28,
      paddingBottom: 24,
    },
    brandRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 10, marginBottom: 28 },
    brandIcon: { width: 42, height: 42, borderRadius: 12 },
    brandName: { fontSize: 22, fontWeight: "800", color: colors.ink, letterSpacing: -0.3 },
    brandTagline: { fontSize: 12, color: colors.muted },
    items: { gap: 4 },
    item: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderRadius: 12,
    },
    itemActive: { backgroundColor: colors.primaryMuted },
    itemLabel: { flex: 1, fontSize: 15, fontWeight: "500", color: colors.ink },
    itemLabelActive: { color: colors.primary, fontWeight: "700" },
    badge: {
      minWidth: 20,
      height: 20,
      paddingHorizontal: 6,
      borderRadius: 10,
      backgroundColor: colors.danger,
      alignItems: "center",
      justifyContent: "center",
    },
    badgeText: { color: colors.white, fontSize: 11, fontWeight: "700" },
    footer: { marginTop: "auto", alignItems: "center", gap: 10, paddingHorizontal: 12 },
    footerText: { fontSize: 14, lineHeight: 20, color: colors.muted, textAlign: "center" },
  });
}
