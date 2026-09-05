import { useEffect, useState } from "react";
import { StyleSheet, TextInput, View, type StyleProp, type TextStyle } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { formatDDMMYYYY, isBeforeToday } from "../utils/date";
import { COLORS } from "../theme/tokens";

function parseDateInput(text: string): Date | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  if (!match) return null;
  const [, day, month, year] = match;
  const parsed = new Date(Number(year), Number(month) - 1, Number(day));
  if (Number.isNaN(parsed.getTime())) return null;
  // Reject impossible calendar dates (e.g. 31/02/2026) that Date silently rolls forward a day.
  if (parsed.getDate() !== Number(day) || parsed.getMonth() !== Number(month) - 1) return null;
  return parsed;
}

function DateTextField({
  value,
  onChangeValidDate,
  placeholder,
  style,
  errorStyle,
}: {
  value: Date | undefined;
  onChangeValidDate: (date: Date) => void;
  placeholder: string;
  style: StyleProp<TextStyle>;
  errorStyle: StyleProp<TextStyle>;
}) {
  const [text, setText] = useState(value ? formatDDMMYYYY(value) : "");
  const [invalid, setInvalid] = useState(false);

  // Keep the buffer in sync when the committed date changes from outside (e.g. cleared on submit).
  useEffect(() => {
    setText(value ? formatDDMMYYYY(value) : "");
    setInvalid(false);
  }, [value]);

  return (
    <View style={[style, styles.fieldRow, invalid && errorStyle]}>
      <MaterialCommunityIcons name="calendar-blank-outline" size={18} color={COLORS.muted} />
      <TextInput
        style={styles.textInput}
        placeholder={placeholder}
        value={text}
        onChangeText={(next) => {
          setText(next);
          const parsed = parseDateInput(next);
          if (parsed && !isBeforeToday(parsed)) {
            setInvalid(false);
            onChangeValidDate(parsed);
          } else {
            setInvalid(next.length > 0);
          }
        }}
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
  return (
    <View style={styles.row}>
      <DateTextField
        style={[inputStyle, styles.flex1]}
        errorStyle={errorStyle}
        placeholder="DD/MM/YYYY"
        value={startDate}
        onChangeValidDate={onChangeStart}
      />
      <DateTextField
        style={[inputStyle, styles.flex1, endError && errorStyle]}
        errorStyle={errorStyle}
        placeholder="DD/MM/YYYY"
        value={endDate}
        onChangeValidDate={onChangeEnd}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 10 },
  flex1: { flex: 1 },
  fieldRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  textInput: { flex: 1, fontSize: 15, color: COLORS.ink },
});
