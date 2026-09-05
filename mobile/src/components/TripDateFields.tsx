import { useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { formatDDMMYYYY, startOfToday } from "../utils/date";
import { COLORS } from "../theme/tokens";

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
      <TouchableOpacity style={[inputStyle, styles.flex1, styles.fieldRow]} onPress={() => setShowStartPicker(true)}>
        <MaterialCommunityIcons name="calendar-blank-outline" size={18} color={COLORS.muted} />
        <Text>Start: {formatDDMMYYYY(startDate)}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[inputStyle, styles.flex1, styles.fieldRow, endError && errorStyle]}
        onPress={() => setShowEndPicker(true)}
      >
        <MaterialCommunityIcons name="calendar-blank-outline" size={18} color={COLORS.muted} />
        <Text style={!endDate && placeholderStyle}>
          {endDate ? `End: ${formatDDMMYYYY(endDate)}` : "End date"}
        </Text>
      </TouchableOpacity>

      {showStartPicker && (
        <DateTimePicker
          value={startDate}
          mode="date"
          minimumDate={startOfToday()}
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
          minimumDate={startOfToday()}
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
  fieldRow: { flexDirection: "row", alignItems: "center", gap: 8 },
});
