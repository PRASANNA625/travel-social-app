import { useEffect, useState, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "../../theme/ThemeContext";
import { FONT, RADIUS } from "../../theme/tokens";

// Value that settles `delay` ms after the last change (for search-as-you-type).
export function useDebounced<T>(value: T, delay = 300) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return settled;
}

// Row selection for bulk actions.
export function useSelection() {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  return {
    selected,
    toggle: (key: string) =>
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      }),
    toggleAll: (keys: string[]) =>
      setSelected((prev) => (keys.every((k) => prev.has(k)) ? new Set() : new Set(keys))),
    clear: () => setSelected(new Set()),
  };
}

export function SectionTitle({ title, description, right }: { title: string; description: string; right?: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={styles.titleRow}>
      <View style={styles.titleText}>
        <Text style={[styles.title, { color: colors.ink }]} accessibilityRole="header">
          {title}
        </Text>
        <Text style={[styles.description, { color: colors.muted }]}>{description}</Text>
      </View>
      {right ? <View style={styles.titleRight}>{right}</View> : null}
    </View>
  );
}

export function Toolbar({ children }: { children: ReactNode }) {
  return <View style={styles.toolbar}>{children}</View>;
}

// Appears while rows are selected.
export function BulkBar({ count, children, onClear }: { count: number; children: ReactNode; onClear: () => void }) {
  const { colors } = useTheme();
  if (count === 0) return null;
  return (
    <View style={[styles.bulk, { backgroundColor: colors.primaryMuted, borderColor: colors.primary }]}>
      <Text style={[styles.bulkText, { color: colors.ink }]}>
        {count} selected ·{" "}
        <Text style={{ color: colors.primary }} onPress={onClear} accessibilityRole="button">
          Clear
        </Text>
      </Text>
      <View style={styles.bulkActions}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 16 },
  titleText: { flexShrink: 1, minWidth: 220 },
  title: { ...FONT.pageTitle, fontSize: 24 },
  description: { fontSize: 14, marginTop: 4 },
  titleRight: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  toolbar: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  bulk: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, borderWidth: 1, borderRadius: RADIUS.field, padding: 10, marginBottom: 12 },
  bulkText: { fontSize: 13.5, fontWeight: "600" },
  bulkActions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
