import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { Trip } from "../types";
import { TRAVEL_MODE_LABELS } from "../types";

const STATUS_COLORS: Record<Trip["status"], string> = {
  PLANNING: "#94a3b8",
  OPEN: "#0f766e",
  ALMOST_FULL: "#d97706",
  FULL: "#dc2626",
  STARTED: "#2563eb",
  COMPLETED: "#6b7280",
  CANCELLED: "#991b1b",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function TripCard({ trip, onPress }: { trip: Trip; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      {trip.images[0] ? (
        <Image source={{ uri: trip.images[0] }} style={styles.image} />
      ) : (
        <View style={[styles.image, styles.imagePlaceholder]}>
          <Text style={{ fontSize: 32 }}>{TRAVEL_MODE_LABELS[trip.travelMode].split(" ")[0]}</Text>
        </View>
      )}

      <View style={styles.body}>
        <View style={styles.rowBetween}>
          <Text style={styles.title} numberOfLines={1}>
            {trip.title}
          </Text>
          <View style={[styles.statusPill, { backgroundColor: STATUS_COLORS[trip.status] }]}>
            <Text style={styles.statusText}>{trip.status.replace("_", " ")}</Text>
          </View>
        </View>

        <Text style={styles.destination}>📍 {trip.destination}</Text>
        <Text style={styles.meta}>
          {formatDate(trip.startDate)} – {formatDate(trip.endDate)} · {TRAVEL_MODE_LABELS[trip.travelMode]}
        </Text>

        <View style={styles.rowBetween}>
          <Text style={styles.meta}>
            👥 {trip.seatsFilled}/{trip.seats} joined
          </Text>
          <Text style={styles.meta}>
            ❤️ {trip._count.likes} · 💬 {trip._count.comments} · 🙋 {trip._count.joinRequests}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#eee",
    elevation: 2,
    shadowColor: "#0f172a",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  image: { width: "100%", height: 140 },
  imagePlaceholder: { alignItems: "center", justifyContent: "center", backgroundColor: "#f1f5f9" },
  body: { padding: 12, gap: 4 },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { fontSize: 16, fontWeight: "700", flexShrink: 1, marginRight: 8 },
  destination: { fontSize: 14, color: "#334155" },
  meta: { fontSize: 12, color: "#64748b" },
  statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  statusText: { color: "#fff", fontSize: 10, fontWeight: "700" },
});
