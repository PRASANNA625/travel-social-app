import { useMemo, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "../theme/ThemeContext";
import type { Palette } from "../theme/palettes";

// One heading style for every Discover section: title, optional muted count or
// subtitle, and an optional control on the right (See All, view toggles, ...).
export function SectionHeader({
  title,
  meta,
  right,
  horizontalPadding,
}: {
  title: string;
  meta?: string;
  right?: ReactNode;
  horizontalPadding: number;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={[styles.row, { paddingHorizontal: horizontalPadding }]}>
      <View style={styles.heading}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {meta ? (
          <Text style={styles.meta} numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}

function createStyles(colors: Palette) {
  return StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      minHeight: 36,
      marginBottom: 12,
    },
    heading: { flexDirection: "row", alignItems: "baseline", gap: 8, flexShrink: 1, minWidth: 0 },
    title: { fontSize: 19, fontWeight: "800", color: colors.ink, letterSpacing: -0.3, flexShrink: 0 },
    meta: { fontSize: 13, color: colors.muted, fontWeight: "500", flexShrink: 1 },
  });
}
