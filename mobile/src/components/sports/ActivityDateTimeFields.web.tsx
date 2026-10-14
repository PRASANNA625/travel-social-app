import type { CSSProperties } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { formatDDMMYYYY, startOfToday } from "../../utils/date";
import { useTheme } from "../../theme/ThemeContext";

// Web sibling of ActivityDateTimeFields.tsx: invisible <input type="date"> and
// <input type="time"> stretched over styled fields, like TripDateFields.web.

const pad = (n: number) => String(n).padStart(2, "0");
const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const isoTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

const overlay: CSSProperties = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  opacity: 0,
  cursor: "pointer",
  border: "none",
  padding: 0,
  margin: 0,
};

function openPicker(input: HTMLInputElement) {
  try {
    input.showPicker?.();
  } catch {
    // Not allowed here (e.g. a cross-origin frame); the browser's default applies.
  }
}

const pickerHandlers = {
  onClick: (e: { currentTarget: HTMLInputElement }) => openPicker(e.currentTarget),
  onKeyDown: (e: { key: string; preventDefault: () => void; currentTarget: HTMLInputElement }) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openPicker(e.currentTarget);
    }
  },
};

export function ActivityDateTimeFields({
  value,
  onChange,
  error,
  inputStyle,
  errorStyle,
}: {
  value: Date;
  onChange: (date: Date) => void;
  error?: boolean;
  inputStyle: StyleProp<ViewStyle>;
  errorStyle: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const time = value.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

  return (
    <View style={styles.row}>
      <View style={[inputStyle, styles.field, error && errorStyle]}>
        <MaterialCommunityIcons name="calendar-blank-outline" size={18} color={colors.muted} />
        <Text style={[styles.text, { color: colors.ink }]}>{formatDDMMYYYY(value)}</Text>
        <input
          type="date"
          aria-label="Date"
          value={isoDate(value)}
          min={isoDate(startOfToday())}
          onChange={(e) => {
            const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(e.target.value);
            if (!m) return;
            const next = new Date(value);
            next.setFullYear(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
            onChange(next);
          }}
          {...pickerHandlers}
          style={overlay}
        />
      </View>
      <View style={[inputStyle, styles.field, error && errorStyle]}>
        <MaterialCommunityIcons name="clock-outline" size={18} color={colors.muted} />
        <Text style={[styles.text, { color: colors.ink }]}>{time}</Text>
        <input
          type="time"
          aria-label="Start time"
          step={300}
          value={isoTime(value)}
          onChange={(e) => {
            const m = /^(\d{2}):(\d{2})/.exec(e.target.value);
            if (!m) return;
            const next = new Date(value);
            next.setHours(Number(m[1]), Number(m[2]), 0, 0);
            onChange(next);
          }}
          {...pickerHandlers}
          style={overlay}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 10 },
  field: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, position: "relative" },
  text: { flex: 1, fontSize: 15 },
});
