import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FONT, pageGutter } from "../../theme/tokens";
import { useTheme } from "../../theme/ThemeContext";
import { useResponsiveLayout } from "../../theme/layout";
import { IconButton } from "./IconButton";

// The one page header used across the app (Discover keeps its hero banner).
// Top-level pages get a large title; pages opened on top of them get a back
// button and a smaller title. `maxWidth` lines the header up with the page's
// centered content column on wide screens; like the content containers, it
// includes the horizontal page gutter.
export function ScreenHeader({
  title,
  subtitle,
  showBack = false,
  onBack,
  right,
  maxWidth,
}: {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  // Overrides the default back behavior.
  onBack?: () => void;
  right?: ReactNode;
  maxWidth?: number;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { isDesktop } = useResponsiveLayout();
  const navigation = useNavigation();
  const hasBack = showBack || !!onBack;

  const goBack = () => {
    if (onBack) return onBack();
    // After a browser refresh there may be nothing to go back to: fall back to the tabs.
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate("Tabs" as never);
  };

  return (
    <View
      style={[
        styles.header,
        { paddingTop: insets.top + (isDesktop ? 24 : 12), paddingHorizontal: pageGutter(isDesktop) },
        maxWidth !== undefined && { maxWidth, width: "100%", alignSelf: "center" },
      ]}
    >
      <View style={styles.row}>
        {hasBack && <IconButton icon="arrow-left" label="Go back" onPress={goBack} />}
        <View style={styles.titleBlock}>
          <Text
            style={[hasBack ? FONT.screenTitle : FONT.pageTitle, { color: colors.ink }]}
            numberOfLines={1}
            accessibilityRole="header"
          >
            {title}
          </Text>
          {subtitle ? (
            <Text style={[styles.subtitle, { color: colors.muted }]} numberOfLines={2}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {right ? <View style={styles.right}>{right}</View> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingBottom: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 44 },
  titleBlock: { flex: 1, minWidth: 0 },
  subtitle: { ...FONT.bodySmall, marginTop: 2 },
  right: { flexDirection: "row", alignItems: "center", gap: 8 },
});
