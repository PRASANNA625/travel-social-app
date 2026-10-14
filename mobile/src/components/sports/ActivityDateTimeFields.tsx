import { useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { formatDDMMYYYY, startOfToday } from "../../utils/date";
import { useTheme } from "../../theme/ThemeContext";

// Date and start time of a sports meetup, kept in one Date.
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
  const [picker, setPicker] = useState<"date" | "time" | null>(null);
  const time = value.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

  return (
    <View style={styles.row}>
      <TouchableOpacity style={[inputStyle, styles.field, error && errorStyle]} onPress={() => setPicker("date")} accessibilityLabel="Date">
        <MaterialCommunityIcons name="calendar-blank-outline" size={18} color={colors.muted} />
        <Text style={{ color: colors.ink }}>{formatDDMMYYYY(value)}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[inputStyle, styles.field, error && errorStyle]} onPress={() => setPicker("time")} accessibilityLabel="Start time">
        <MaterialCommunityIcons name="clock-outline" size={18} color={colors.muted} />
        <Text style={{ color: colors.ink }}>{time}</Text>
      </TouchableOpacity>
      {picker && (
        <DateTimePicker
          value={value}
          mode={picker}
          minimumDate={picker === "date" ? startOfToday() : undefined}
          minuteInterval={5}
          onChange={(_, date) => {
            setPicker(null);
            if (date) onChange(date);
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 10 },
  field: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
});
