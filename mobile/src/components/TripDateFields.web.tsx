import type { CSSProperties } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { formatDDMMYYYY, startOfToday } from "../utils/date";
import { COLORS } from "../theme/tokens";

// Metro-platform-split sibling of TripDateFields.tsx: the native file opens
// @react-native-community/datetimepicker (no web build), so this variant
// uses a real HTML5 <input type="date"> instead - the browser's own
// calendar picker, with "min" disabling past dates natively. The input is
// rendered invisible and stretched over the field; the field's own Text
// shows the DD/MM/YYYY display so the look matches the native button
// exactly, and clicking anywhere on the field opens the browser's date
// picker underneath.

function toISODateValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseISODateValue(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day] = match;
  return new Date(Number(year), Number(month) - 1, Number(day));
}

// Plain CSS for the raw DOM <input> element - it is not a react-native-web
// component, so it takes a normal React DOM style object rather than an RN
// StyleSheet style. Invisible and stretched over the field so a click
// anywhere opens the browser's native date picker.
const dateInputStyle: CSSProperties = {
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

function DateField({
  value,
  onChangeValidDate,
  label,
  placeholder,
  min,
  style,
  placeholderStyle,
}: {
  value: Date | undefined;
  onChangeValidDate: (date: Date) => void;
  label: string;
  placeholder: string;
  min: string;
  style: StyleProp<ViewStyle>;
  placeholderStyle: object;
}) {
  return (
    <View style={[style, styles.fieldRow]}>
      <MaterialCommunityIcons name="calendar-blank-outline" size={18} color={COLORS.muted} />
      <Text style={[styles.displayText, !value && placeholderStyle]}>
        {value ? `${label}: ${formatDDMMYYYY(value)}` : placeholder}
      </Text>
      <input
        type="date"
        value={value ? toISODateValue(value) : ""}
        min={min}
        aria-label={label}
        onChange={(e) => {
          const parsed = parseISODateValue(e.target.value);
          if (parsed) onChangeValidDate(parsed);
        }}
        style={dateInputStyle}
      />
    </View>
  );
}

export function TripDateFields({
  startDate,
  endDate,
  onChangeStart,
  onChangeEnd,
  endError,
  inputStyle,
  errorStyle,
  placeholderStyle,
}: {
  startDate: Date;
  endDate: Date | undefined;
  onChangeStart: (date: Date) => void;
  onChangeEnd: (date: Date) => void;
  endError: boolean;
  inputStyle: object;
  errorStyle: object;
  placeholderStyle: object;
}) {
  const todayIso = toISODateValue(startOfToday());

  return (
    <View style={styles.row}>
      <DateField
        style={[inputStyle, styles.flex1]}
        label="Start"
        placeholder="DD/MM/YYYY"
        min={todayIso}
        value={startDate}
        onChangeValidDate={onChangeStart}
        placeholderStyle={placeholderStyle}
      />
      <DateField
        style={[inputStyle, styles.flex1, endError && errorStyle]}
        label="End"
        placeholder="End date"
        min={todayIso}
        value={endDate}
        onChangeValidDate={onChangeEnd}
        placeholderStyle={placeholderStyle}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 10 },
  flex1: { flex: 1 },
  fieldRow: { flexDirection: "row", alignItems: "center", gap: 8, position: "relative" },
  displayText: { flex: 1, fontSize: 15, color: COLORS.ink },
});
