import { useEffect, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { useTheme } from "../../theme/ThemeContext";
import { RADIUS } from "../../theme/tokens";

// Optional date and time (local), as an ISO string. Native: typed as "YYYY-MM-DD HH:MM"
// (the web build uses the browser's picker; the dashboard is used mostly on desktop).
const pad = (n: number) => String(n).padStart(2, "0");
const show = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export function DateTimeField({ label, value, onChange, disabled }: { label: string; value: string | null; onChange: (iso: string | null) => void; disabled?: boolean }) {
  const { colors } = useTheme();
  const [text, setText] = useState(show(value));
  useEffect(() => setText(show(value)), [value]);
  const commit = () => {
    if (!text.trim()) return onChange(null);
    const m = text.trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/);
    if (m) onChange(new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).toISOString());
    else setText(show(value));
  };
  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: colors.muted }]}>{label}</Text>
      <TextInput
        style={[styles.field, { borderColor: colors.border, backgroundColor: colors.fieldBg, color: colors.ink }]}
        value={text}
        onChangeText={setText}
        onBlur={commit}
        editable={!disabled}
        placeholder="YYYY-MM-DD HH:MM"
        placeholderTextColor={colors.mutedLight}
        accessibilityLabel={label}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6, flexGrow: 1, flexBasis: 220 },
  label: { fontSize: 12.5, fontWeight: "600" },
  field: { borderWidth: 1, borderRadius: RADIUS.field, paddingHorizontal: 12, height: 42, fontSize: 14 },
});
