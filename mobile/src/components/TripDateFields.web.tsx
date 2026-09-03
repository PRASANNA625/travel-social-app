import { useEffect, useState } from "react";
import { StyleSheet, TextInput, View, type StyleProp, type TextStyle } from "react-native";

function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateInput(text: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const parsed = new Date(`${text}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function DateTextField({
  value,
  onChangeValidDate,
  placeholder,
  style,
}: {
  value: Date | undefined;
  onChangeValidDate: (date: Date) => void;
  placeholder: string;
  style: StyleProp<TextStyle>;
}) {
  const [text, setText] = useState(value ? toDateInputValue(value) : "");

  // Keep the buffer in sync when the committed date changes from outside (e.g. cleared on submit).
  useEffect(() => {
    setText(value ? toDateInputValue(value) : "");
  }, [value]);

  return (
    <TextInput
      style={style}
      placeholder={placeholder}
      value={text}
      onChangeText={(next) => {
        setText(next);
        const parsed = parseDateInput(next);
        if (parsed) onChangeValidDate(parsed);
      }}
    />
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
        placeholder="Start date (YYYY-MM-DD)"
        value={startDate}
        onChangeValidDate={onChangeStart}
      />
      <DateTextField
        style={[inputStyle, styles.flex1, endError && errorStyle]}
        placeholder="End date (YYYY-MM-DD)"
        value={endDate}
        onChangeValidDate={onChangeEnd}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 10 },
  flex1: { flex: 1 },
});
