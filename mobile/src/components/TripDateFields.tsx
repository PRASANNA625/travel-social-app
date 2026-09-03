import { useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";

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
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  return (
    <View style={styles.row}>
      <TouchableOpacity style={[inputStyle, styles.flex1]} onPress={() => setShowStartPicker(true)}>
        <Text>Start: {startDate.toDateString()}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[inputStyle, styles.flex1, endError && errorStyle]}
        onPress={() => setShowEndPicker(true)}
      >
        <Text style={!endDate && placeholderStyle}>{endDate ? `End: ${endDate.toDateString()}` : "End date"}</Text>
      </TouchableOpacity>

      {showStartPicker && (
        <DateTimePicker
          value={startDate}
          mode="date"
          onChange={(_, date) => {
            setShowStartPicker(false);
            if (date) onChangeStart(date);
          }}
        />
      )}
      {showEndPicker && (
        <DateTimePicker
          value={endDate ?? new Date(startDate.getTime() + 86400000)}
          mode="date"
          onChange={(_, date) => {
            setShowEndPicker(false);
            if (date) onChangeEnd(date);
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 10 },
  flex1: { flex: 1 },
});
