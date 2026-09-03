import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AppStackParamList } from "../navigation/types";
import { useJoinRequestsForTrip, useRespondToJoinRequest } from "../api/joinRequests";
import type { JoinRequest } from "../types";

type Props = NativeStackScreenProps<AppStackParamList, "JoinRequestsInbox">;

const STATUS_LABEL: Record<JoinRequest["status"], string> = {
  PENDING: "⏳ Pending",
  APPROVED: "✅ Approved",
  REJECTED: "❌ Rejected",
};

export function JoinRequestsInboxScreen({ route, navigation }: Props) {
  const { tripId } = route.params;
  const { data: requests, isLoading } = useJoinRequestsForTrip(tripId);
  const respond = useRespondToJoinRequest(tripId);

  if (isLoading) return <ActivityIndicator style={{ marginTop: 40 }} size="large" />;

  return (
    <FlatList
      contentContainerStyle={styles.list}
      data={requests ?? []}
      keyExtractor={(item) => item.id}
      ListEmptyComponent={<Text style={styles.empty}>No one has requested to join yet.</Text>}
      renderItem={({ item }) => (
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
            <Text style={styles.statusLabel}>{STATUS_LABEL[item.status]}</Text>
          )}
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: 12 },
  empty: { textAlign: "center", color: "#94a3b8", marginTop: 40 },
  card: { backgroundColor: "#fff", borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: "#eee" },
  name: { fontSize: 16, fontWeight: "700", color: "#0f766e" },
  meta: { fontSize: 13, color: "#64748b", marginTop: 2 },
  message: { fontSize: 13, color: "#334155", marginTop: 6, fontStyle: "italic" },
  actionsRow: { flexDirection: "row", gap: 10, marginTop: 12 },
  actionButton: { flex: 1, padding: 10, borderRadius: 8, alignItems: "center" },
  approve: { backgroundColor: "#0f766e" },
  reject: { backgroundColor: "#dc2626" },
  actionText: { color: "#fff", fontWeight: "700" },
  statusLabel: { marginTop: 10, fontWeight: "600" },
});
