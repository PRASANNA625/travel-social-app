import type { ComponentProps } from "react";
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AppStackParamList } from "../navigation/types";
import { useJoinRequestsForTrip, useRespondToJoinRequest } from "../api/joinRequests";
import type { JoinRequest } from "../types";
import { Skeleton } from "../components/theme/Skeleton";
import { COLORS, RADIUS } from "../theme/tokens";

type Props = NativeStackScreenProps<AppStackParamList, "JoinRequestsInbox">;
type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

const RESOLVED_STATUS: Record<"APPROVED" | "REJECTED", { icon: IconName; bg: string; color: string; label: string }> = {
  APPROVED: { icon: "check-circle", bg: COLORS.successBg, color: COLORS.primary, label: "Approved" },
  REJECTED: { icon: "close-circle-outline", bg: COLORS.dangerBg, color: COLORS.danger, label: "Rejected" },
};

export function JoinRequestsInboxScreen({ route, navigation }: Props) {
  const { tripId } = route.params;
  const { data: requests, isLoading } = useJoinRequestsForTrip(tripId);
  const respond = useRespondToJoinRequest(tripId);

  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.list}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={styles.skeletonCard}>
              <Skeleton style={styles.skeletonName} />
              <Skeleton style={styles.skeletonMeta} />
              <View style={styles.skeletonActionsRow}>
                <Skeleton style={styles.skeletonAction} />
                <Skeleton style={styles.skeletonAction} />
              </View>
            </View>
          ))}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        contentContainerStyle={styles.list}
        data={requests ?? []}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <MaterialCommunityIcons name="account-clock-outline" size={40} color={COLORS.mutedLight} />
            <Text style={styles.empty}>No one has requested to join yet.</Text>
          </View>
        }
        renderItem={({ item }: { item: JoinRequest }) => (
          <View style={styles.card}>
            <TouchableOpacity onPress={() => navigation.navigate("UserProfile", { userId: item.userId })}>
              <Text style={styles.name}>{item.user?.name}</Text>
            </TouchableOpacity>
            {item.user?.location && <Text style={styles.meta}>📍 {item.user.location}</Text>}
            {item.user?.bio && <Text style={styles.meta}>{item.user.bio}</Text>}
            {item.message && <Text style={styles.message}>"{item.message}"</Text>}

            {item.status === "PENDING" ? (
              <View style={styles.actionsRow}>
                <TouchableOpacity
                  style={[styles.actionButton, styles.approve]}
                  onPress={() => respond.mutate({ requestId: item.id, approve: true })}
                >
                  <Text style={styles.actionText}>Approve</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionButton, styles.reject]}
                  onPress={() => respond.mutate({ requestId: item.id, approve: false })}
                >
                  <Text style={styles.actionText}>Reject</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={[styles.statusPill, { backgroundColor: RESOLVED_STATUS[item.status].bg }]}>
                <MaterialCommunityIcons
                  name={RESOLVED_STATUS[item.status].icon}
                  size={14}
                  color={RESOLVED_STATUS[item.status].color}
                />
                <Text style={[styles.statusLabel, { color: RESOLVED_STATUS[item.status].color }]}>
                  {RESOLVED_STATUS[item.status].label}
                </Text>
              </View>
            )}
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.fieldBg },
  list: { padding: 12, gap: 12 },
  empty: { textAlign: "center", color: COLORS.mutedLight },
  emptyWrap: { alignItems: "center", gap: 10, marginTop: 60, paddingHorizontal: 32 },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.field,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  name: { fontSize: 16, fontWeight: "700", color: COLORS.primary },
  meta: { fontSize: 13, color: COLORS.muted, marginTop: 2 },
  message: { fontSize: 13, color: "#334155", marginTop: 6, fontStyle: "italic" },
  actionsRow: { flexDirection: "row", gap: 10, marginTop: 12 },
  actionButton: { flex: 1, padding: 10, borderRadius: 8, alignItems: "center" },
  approve: { backgroundColor: COLORS.primary },
  reject: { backgroundColor: COLORS.danger },
  actionText: { color: COLORS.white, fontWeight: "700" },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    borderRadius: RADIUS.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginTop: 10,
  },
  statusLabel: { fontSize: 12.5, fontWeight: "700" },
  skeletonCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.field,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 8,
  },
  skeletonName: { height: 16, width: "50%" },
  skeletonMeta: { height: 12, width: "70%" },
  skeletonActionsRow: { flexDirection: "row", gap: 10, marginTop: 4 },
  skeletonAction: { flex: 1, height: 38, borderRadius: 8 },
});
