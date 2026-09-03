import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
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

export function TripCard({
  trip,
  onPress,
  onDelete,
}: {
  trip: Trip;
  onPress: () => void;
  onDelete?: () => void;
}) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.9}>
      <View style={styles.imageWrap}>
        {trip.images[0] ? (
          <Image source={{ uri: trip.images[0] }} style={styles.image} />
        ) : (
          <LinearGradient colors={["#2563eb", "#0f766e"]} style={[styles.image, styles.imagePlaceholder]}>
            <Text style={{ fontSize: 32 }}>{TRAVEL_MODE_LABELS[trip.travelMode].split(" ")[0]}</Text>
          </LinearGradient>
        )}

        <View style={[styles.statusPill, { backgroundColor: STATUS_COLORS[trip.status] }]}>
          <Text style={styles.statusText}>{trip.status.replace("_", " ")}</Text>
        </View>

        {onDelete && (
          <TouchableOpacity style={styles.deleteButton} onPress={onDelete} hitSlop={8}>
            <Text style={styles.deleteButtonText}>🗑️</Text>
          </TouchableOpacity>
        )}

        <LinearGradient colors={["transparent", "rgba(15,23,42,0.85)"]} style={styles.imageScrim}>
          <Text style={styles.title} numberOfLines={1}>
            {trip.title}
          </Text>
          <Text style={styles.overlayMeta}>
            📍 {trip.destination} · {formatDate(trip.startDate)} – {formatDate(trip.endDate)}
          </Text>
        </LinearGradient>
      </View>

      <View style={styles.body}>
        <Text style={styles.mode}>{TRAVEL_MODE_LABELS[trip.travelMode]}</Text>
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
    borderRadius: 18,
    overflow: "hidden",
    marginBottom: 16,
    elevation: 3,
    shadowColor: "#0f172a",
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  imageWrap: { width: "100%", height: 170 },
  image: { width: "100%", height: "100%" },
  imagePlaceholder: { alignItems: "center", justifyContent: "center" },
  imageScrim: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 14,
    paddingTop: 28,
    paddingBottom: 10,
  },
  statusPill: {
    position: "absolute",
    top: 10,
    right: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusText: { color: "#fff", fontSize: 10, fontWeight: "700" },
  deleteButton: {
    position: "absolute",
    top: 10,
    left: 10,
    backgroundColor: "rgba(15,23,42,0.6)",
    borderRadius: 999,
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  deleteButtonText: { fontSize: 13 },
  body: { padding: 12, paddingTop: 10, gap: 6 },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { fontSize: 17, fontWeight: "700", color: "#fff" },
  overlayMeta: { fontSize: 12, color: "#e2e8f0", marginTop: 2 },
  mode: { fontSize: 12, fontWeight: "600", color: "#0f766e" },
  meta: { fontSize: 12, color: "#64748b" },
});
