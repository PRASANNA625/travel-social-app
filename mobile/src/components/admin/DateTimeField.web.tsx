import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme } from "../../theme/ThemeContext";
import { RADIUS } from "../../theme/tokens";

// Optional date and time (local), as an ISO string. Web: the browser's own picker.
const pad = (n: number) => String(n).padStart(2, "0");
const toLocal = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export function DateTimeField({ label, value, onChange, disabled }: { label: string; value: string | null; onChange: (iso: string | null) => void; disabled?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: colors.muted }]}>{label}</Text>
      <View style={styles.row}>
        <View style={[styles.field, { borderColor: colors.border, backgroundColor: colors.fieldBg }]}>
          <input
            type="datetime-local"
            aria-label={label}
            disabled={disabled}
            value={value ? toLocal(value) : ""}
            onChange={(e) => onChange(e.target.value ? new Date(e.target.value).toISOString() : null)}
            style={{ border: "none", background: "transparent", color: colors.ink, font: "inherit", fontSize: 14, width: "100%", outline: "none", colorScheme: "light dark" }}
          />
        </View>
        {value && !disabled && (
          <TouchableOpacity onPress={() => onChange(null)} style={styles.clear} accessibilityRole="button" accessibilityLabel={`Clear ${label}`}>
            <MaterialCommunityIcons name="close-circle" size={18} color={colors.mutedLight} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6, flexGrow: 1, flexBasis: 220 },
  label: { fontSize: 12.5, fontWeight: "600" },
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
  field: { flex: 1, borderWidth: 1, borderRadius: RADIUS.field, paddingHorizontal: 12, height: 42, justifyContent: "center" },
  clear: { padding: 6 },
});
