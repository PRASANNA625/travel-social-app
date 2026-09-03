import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useMarkAllNotificationsRead, useMarkNotificationRead, useNotifications } from "../api/notifications";
import type { AppNotification } from "../types";

const NOTIFICATION_COPY: Record<string, (payload: Record<string, unknown>) => string> = {
  NEW_JOIN_REQUEST: (p) => `Someone wants to join "${p.tripTitle}"`,
  JOIN_REQUEST_APPROVED: (p) => `You're in! Your request for "${p.tripTitle}" was approved`,
  JOIN_REQUEST_REJECTED: (p) => `Your request for "${p.tripTitle}" wasn't approved`,
};

function describe(notification: AppNotification): string {
  const formatter = NOTIFICATION_COPY[notification.type];
  return formatter ? formatter(notification.payload) : notification.type;
}

export function NotificationsScreen() {
  const { data, isLoading } = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  if (isLoading) return <ActivityIndicator style={{ marginTop: 40 }} size="large" />;

  return (
    <View style={styles.container}>
      {!!data?.unreadCount && (
        <TouchableOpacity style={styles.markAll} onPress={() => markAllRead.mutate()}>
          <Text style={styles.markAllText}>Mark all as read ({data.unreadCount})</Text>
        </TouchableOpacity>
      )}
      <FlatList
        contentContainerStyle={styles.list}
        data={data?.items ?? []}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={<Text style={styles.empty}>You're all caught up.</Text>}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.item, !item.read && styles.itemUnread]}
            onPress={() => !item.read && markRead.mutate(item.id)}
          >
            <Text style={styles.itemText}>{describe(item)}</Text>
            <Text style={styles.itemTime}>{new Date(item.createdAt).toLocaleString()}</Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc" },
  markAll: { padding: 12, alignItems: "flex-end" },
  markAllText: { color: "#0f766e", fontWeight: "600", fontSize: 13 },
  list: { padding: 12 },
  empty: { textAlign: "center", color: "#94a3b8", marginTop: 40 },
  item: { backgroundColor: "#fff", padding: 14, borderRadius: 10, marginBottom: 8, borderWidth: 1, borderColor: "#eee" },
  itemUnread: { borderColor: "#0f766e", backgroundColor: "#f0fdfa" },
  itemText: { fontSize: 14, color: "#1e293b" },
  itemTime: { fontSize: 11, color: "#94a3b8", marginTop: 4 },
});
