import { useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme } from "../../theme/ThemeContext";
import { RADIUS } from "../../theme/tokens";
import { EmptyBlock, ErrorBlock, LoadingBlock } from "./AdminUI";

export interface Column<T> {
  key: string;
  title: string;
  render: (row: T) => ReactNode;
  // Relative width on wide screens (flex); defaults to 1.
  flex?: number;
  align?: "left" | "right";
  // Shown as the card's heading on narrow screens (use for the main column).
  primary?: boolean;
  // Left out of the narrow card layout.
  hideOnNarrow?: boolean;
}

// One table component for every admin list. Wide: a real table with a header row.
// Narrow (< 720px): each row becomes a card listing its fields, so nothing is
// squeezed or scrolled sideways. Handles loading, error, empty and selection.
export function DataTable<T>({
  columns,
  rows,
  keyOf,
  loading,
  error,
  onRetry,
  empty,
  onRowPress,
  selected,
  onToggleSelect,
  onToggleAll,
  actions,
}: {
  columns: Column<T>[];
  rows: T[] | undefined;
  keyOf: (row: T) => string;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  empty: { icon: Parameters<typeof EmptyBlock>[0]["icon"]; title: string; message?: string };
  onRowPress?: (row: T) => void;
  selected?: Set<string>;
  onToggleSelect?: (key: string) => void;
  onToggleAll?: (keys: string[]) => void;
  // Per-row action buttons, rendered at the end of the row / bottom of the card.
  actions?: (row: T) => ReactNode;
}) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const narrow = width > 0 && width < 720;
  const selectable = !!selected && !!onToggleSelect;
  const keys = rows?.map(keyOf) ?? [];
  const allSelected = selectable && keys.length > 0 && keys.every((k) => selected!.has(k));

  const checkbox = (checked: boolean, onPress: () => void, label: string) => (
    <TouchableOpacity onPress={onPress} hitSlop={8} accessibilityRole="checkbox" accessibilityState={{ checked }} accessibilityLabel={label}>
      <MaterialCommunityIcons name={checked ? "checkbox-marked" : "checkbox-blank-outline"} size={20} color={checked ? colors.primary : colors.mutedLight} />
    </TouchableOpacity>
  );

  let body: ReactNode;
  if (loading && !rows) body = <LoadingBlock />;
  else if (error) body = <ErrorBlock message={error} onRetry={onRetry} />;
  else if (!rows || rows.length === 0) body = <EmptyBlock {...empty} />;
  else if (narrow) {
    body = (
      <View style={styles.cards}>
        {rows.map((row) => {
          const key = keyOf(row);
          const primary = columns.find((c) => c.primary) ?? columns[0];
          return (
            <Pressable
              key={key}
              onPress={onRowPress ? () => onRowPress(row) : undefined}
              style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surfaceElevated }]}
            >
              <View style={styles.cardHead}>
                {selectable && checkbox(selected!.has(key), () => onToggleSelect!(key), "Select row")}
                <View style={styles.flex1}>{primary.render(row)}</View>
              </View>
              {columns
                .filter((c) => c !== primary && !c.hideOnNarrow)
                .map((c) => (
                  <View key={c.key} style={styles.cardField}>
                    <Text style={[styles.cardLabel, { color: colors.muted }]}>{c.title}</Text>
                    <View style={styles.cardValue}>{c.render(row)}</View>
                  </View>
                ))}
              {actions && <View style={styles.cardActions}>{actions(row)}</View>}
            </Pressable>
          );
        })}
      </View>
    );
  } else {
    body = (
      <View>
        <View style={[styles.row, styles.headerRow, { borderColor: colors.border, backgroundColor: colors.fieldBg }]}>
          {selectable && <View style={styles.checkCell}>{checkbox(allSelected, () => onToggleAll?.(keys), "Select all rows")}</View>}
          {columns.map((c) => (
            <Text
              key={c.key}
              style={[styles.headerText, { flex: c.flex ?? 1, color: colors.muted, textAlign: c.align ?? "left" }]}
              numberOfLines={1}
            >
              {c.title}
            </Text>
          ))}
          {actions && <View style={styles.actionsCell} />}
        </View>
        {rows.map((row) => {
          const key = keyOf(row);
          const isSelected = selectable && selected!.has(key);
          return (
            <Pressable
              key={key}
              onPress={onRowPress ? () => onRowPress(row) : undefined}
              // react-native-web adds `hovered`.
              style={(state) => [
                styles.row,
                { borderColor: colors.divider },
                ((state as { hovered?: boolean }).hovered || isSelected) && { backgroundColor: colors.fieldBg },
              ]}
            >
              {selectable && <View style={styles.checkCell}>{checkbox(!!isSelected, () => onToggleSelect!(key), "Select row")}</View>}
              {columns.map((c) => (
                <View key={c.key} style={[styles.cell, { flex: c.flex ?? 1, alignItems: c.align === "right" ? "flex-end" : "flex-start" }]}>
                  {c.render(row)}
                </View>
              ))}
              {actions && <View style={styles.actionsCell}>{actions(row)}</View>}
            </Pressable>
          );
        })}
      </View>
    );
  }

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={[styles.wrap, { borderColor: narrow ? "transparent" : colors.border }]}>
      {body}
    </View>
  );
}

// Plain text cell with consistent type.
export function CellText({ children, muted, strong }: { children: ReactNode; muted?: boolean; strong?: boolean }) {
  const { colors } = useTheme();
  return (
    <Text style={[styles.cellText, { color: muted ? colors.muted : colors.ink }, strong && styles.cellStrong]} numberOfLines={2}>
      {children}
    </Text>
  );
}

export function formatDate(iso: string | null | undefined, withTime = false) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

const styles = StyleSheet.create({
  wrap: { borderWidth: 1, borderRadius: RADIUS.field, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, minHeight: 52 },
  headerRow: { minHeight: 40, paddingVertical: 8 },
  headerText: { fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4 },
  cell: { minWidth: 0, justifyContent: "center" },
  checkCell: { width: 24, alignItems: "center" },
  actionsCell: { flexDirection: "row", gap: 6, justifyContent: "flex-end", minWidth: 40 },
  cellText: { fontSize: 13.5 },
  cellStrong: { fontWeight: "700" },
  cards: { gap: 10 },
  card: { borderWidth: 1, borderRadius: RADIUS.field, padding: 12, gap: 8 },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  flex1: { flex: 1, minWidth: 0 },
  cardField: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  cardLabel: { fontSize: 12.5, fontWeight: "600" },
  cardValue: { flexShrink: 1, alignItems: "flex-end" },
  cardActions: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingTop: 4 },
});
