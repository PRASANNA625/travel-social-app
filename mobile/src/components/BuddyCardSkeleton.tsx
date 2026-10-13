import { StyleSheet, View } from "react-native";
import { Skeleton } from "./theme/Skeleton";
import { useTheme } from "../theme/ThemeContext";
import { BUDDY_CARD_WIDTH, COMPACT_BUDDY_CARD_HEIGHT, COMPACT_BUDDY_CARD_WIDTH } from "./BuddyCard";

// Mirrors BuddyCard's shape (cover + avatar + name + tags + buttons) so the
// loading state reads as "buddy cards are coming" instead of a blank row.
export function BuddyCardSkeleton({ width = BUDDY_CARD_WIDTH }: { width?: number }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.card, { width, backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
      <Skeleton style={styles.cover} />
      <View style={[styles.avatarRing, { backgroundColor: colors.surfaceElevated }]}>
        <Skeleton style={styles.avatar} />
      </View>
      <View style={styles.body}>
        <Skeleton style={styles.line} />
        <Skeleton style={styles.lineShort} />
        <View style={styles.tags}>
          <Skeleton style={styles.tag} />
          <Skeleton style={styles.tag} />
        </View>
        <View style={styles.actionsRow}>
          <Skeleton style={styles.action} />
          <Skeleton style={styles.action} />
        </View>
      </View>
    </View>
  );
}

export function CompactBuddyCardSkeleton({ width = COMPACT_BUDDY_CARD_WIDTH }: { width?: number }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.compactCard, { width, backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
      <View style={styles.compactTop}>
        <Skeleton style={styles.compactAvatar} />
        <View style={styles.compactLines}>
          <Skeleton style={styles.compactLine} />
          <Skeleton style={styles.compactLineShort} />
        </View>
      </View>
      <Skeleton style={styles.compactAction} />
    </View>
  );
}

const styles = StyleSheet.create({
  compactCard: { height: COMPACT_BUDDY_CARD_HEIGHT, borderRadius: 16, borderWidth: 1, padding: 14, justifyContent: "space-between" },
  compactTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  compactAvatar: { width: 52, height: 52, borderRadius: 26 },
  compactLines: { flex: 1, gap: 8 },
  compactLine: { height: 14, width: "70%" },
  compactLineShort: { height: 11, width: "45%" },
  compactAction: { height: 34, borderRadius: 10 },
  card: { borderRadius: 20, overflow: "hidden", borderWidth: 1 },
  cover: { height: 112, borderRadius: 0 },
  avatarRing: { alignSelf: "center", marginTop: -46, width: 92, height: 92, borderRadius: 46, alignItems: "center", justifyContent: "center" },
  avatar: { width: 84, height: 84, borderRadius: 42 },
  body: { alignItems: "center", paddingHorizontal: 12, paddingBottom: 12 },
  line: { height: 16, width: "55%", marginTop: 6 },
  lineShort: { height: 12, width: "35%", marginTop: 8 },
  tags: { flexDirection: "row", gap: 6, height: 62, marginTop: 10, justifyContent: "center" },
  tag: { width: 80, height: 28, borderRadius: 14 },
  actionsRow: { flexDirection: "row", gap: 8, marginTop: 34, width: "100%" },
  action: { flex: 1, height: 42, borderRadius: 12 },
});
