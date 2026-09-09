import { StyleSheet, View } from "react-native";
import { Skeleton } from "./theme/Skeleton";
import { useTheme } from "../theme/ThemeContext";

// Mirrors BuddyCard's shape (avatar + name + meta + button row) so the
// loading state reads as "buddy cards are coming" instead of a blank row.
export function BuddyCardSkeleton() {
  const { colors } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: colors.surfaceElevated }]}>
      <Skeleton style={styles.avatar} />
      <Skeleton style={styles.line} />
      <Skeleton style={styles.lineShort} />
      <View style={styles.actionsRow}>
        <Skeleton style={styles.action} />
        <Skeleton style={styles.action} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { width: 240, borderRadius: 20, padding: 14, alignItems: "center" },
  avatar: { width: 72, height: 72, borderRadius: 36, marginBottom: 10 },
  line: { height: 14, width: "60%", marginTop: 4 },
  lineShort: { height: 12, width: "40%", marginTop: 8 },
  actionsRow: { flexDirection: "row", gap: 8, marginTop: 16, width: "100%" },
  action: { flex: 1, height: 34, borderRadius: 10 },
});
