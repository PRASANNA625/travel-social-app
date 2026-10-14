import { StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useAppConfig } from "../api/config";
import { useTheme } from "../theme/ThemeContext";
import { RADIUS } from "../theme/tokens";

// Notice set by admins in Configuration; renders nothing when empty.
export function AnnouncementBanner({ marginHorizontal = 0 }: { marginHorizontal?: number }) {
  const { colors } = useTheme();
  const text = useAppConfig().data?.announcementBanner.trim();
  if (!text) return null;
  return (
    <View
      style={[styles.banner, { marginHorizontal, backgroundColor: colors.warningBg, borderColor: colors.border }]}
      accessibilityRole="alert"
    >
      <MaterialCommunityIcons name="bullhorn-outline" size={18} color={colors.warningText} />
      <Text style={[styles.text, { color: colors.warningText }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: RADIUS.field, paddingHorizontal: 14, paddingVertical: 10, marginTop: 14 },
  text: { flex: 1, fontSize: 14, fontWeight: "600", lineHeight: 20 },
});
