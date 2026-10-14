import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme } from "../../theme/ThemeContext";
import { CONTROL, RADIUS, SHADOW } from "../../theme/tokens";

// Pill-shaped dropdown ("Level: Any ▾") that opens a list to pick one option.
// An empty value means "no filter" and gets a neutral border.
export function SelectChip<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T | "";
  options: { value: T | ""; label: string }[];
  onChange: (v: T | "") => void;
}) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  return (
    <>
      <TouchableOpacity
        style={[styles.select, { backgroundColor: colors.surfaceElevated, borderColor: value ? colors.primary : colors.border }]}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${current?.label ?? "Any"}`}
      >
        <Text style={[styles.selectLabel, { color: colors.muted }]}>{label}:</Text>
        <Text style={[styles.selectValue, { color: colors.ink }]} numberOfLines={1}>
          {current?.label ?? "Any"}
        </Text>
        <MaterialCommunityIcons name="chevron-down" size={16} color={colors.muted} />
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={[styles.backdrop, { backgroundColor: colors.overlay }]} onPress={() => setOpen(false)}>
          <Pressable style={[styles.menu, { backgroundColor: colors.surfaceElevated }]} onPress={() => {}}>
            <Text style={[styles.menuTitle, { color: colors.muted }]}>{label}</Text>
            {options.map((o) => (
              <TouchableOpacity
                key={o.value || "any"}
                style={styles.menuItem}
                onPress={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                accessibilityRole="menuitem"
              >
                <Text style={[styles.menuItemText, { color: colors.ink }]}>{o.label}</Text>
                {o.value === value && <MaterialCommunityIcons name="check" size={18} color={colors.primary} />}
              </TouchableOpacity>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  select: { flexDirection: "row", alignItems: "center", gap: 6, height: CONTROL.chip, borderRadius: RADIUS.pill, borderWidth: 1, paddingHorizontal: 12, maxWidth: 240 },
  selectLabel: { fontSize: 12.5, fontWeight: "600" },
  selectValue: { fontSize: 13, fontWeight: "600", flexShrink: 1 },
  backdrop: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  menu: { width: "100%", maxWidth: 320, borderRadius: RADIUS.card, paddingVertical: 8, ...SHADOW.raised },
  menuTitle: { fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4, paddingHorizontal: 16, paddingVertical: 8 },
  menuItem: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12 },
  menuItemText: { fontSize: 14.5 },
});
