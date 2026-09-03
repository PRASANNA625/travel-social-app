import { StyleSheet, TextInput, View } from "react-native";

function toDateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseDateInput(text: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const parsed = new Date(`${text}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
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
      <TextInput
        style={[inputStyle, styles.flex1]}
        placeholder="Start date (YYYY-MM-DD)"
        value={toDateInputValue(startDate)}
        onChangeText={(text) => {
          const parsed = parseDateInput(text);
          if (parsed) onChangeStart(parsed);
        }}
      />
      <TextInput
        style={[inputStyle, styles.flex1, endError && errorStyle]}
        placeholder="End date (YYYY-MM-DD)"
        value={endDate ? toDateInputValue(endDate) : ""}
        onChangeText={(text) => {
          const parsed = parseDateInput(text);
          if (parsed) onChangeEnd(parsed);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 10 },
  flex1: { flex: 1 },
});
