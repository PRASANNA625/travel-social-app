import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { Trip } from "../types";
import { TRAVEL_MODE_ICONS, travelModeText } from "../utils/travelModeIcons";

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
          <LinearGradient colors={["#1d4ed8", "#0f766e"]} style={[styles.image, styles.imagePlaceholder]}>
            <MaterialCommunityIcons
              name={TRAVEL_MODE_ICONS[trip.travelMode]}
              size={104}
              color="rgba(255,255,255,0.22)"
              style={styles.imagePlaceholderIcon}
            />
          </LinearGradient>
        )}

        <View style={[styles.statusPill, { backgroundColor: STATUS_COLORS[trip.status] }]}>
          <Text style={styles.statusText}>{trip.status.replace("_", " ")}</Text>
        </View>

        {onDelete && (
          <TouchableOpacity style={styles.deleteButton} onPress={onDelete} hitSlop={8}>
            <MaterialCommunityIcons name="trash-can-outline" size={15} color="#fff" />
          </TouchableOpacity>
        )}

        <LinearGradient colors={["transparent", "rgba(15,23,42,0.88)"]} style={styles.imageScrim}>
          <Text style={styles.title} numberOfLines={1}>
            {trip.title}
          </Text>
          <View style={styles.overlayMetaRow}>
            <MaterialCommunityIcons name="map-marker" size={13} color="#e2e8f0" />
            <Text style={styles.overlayMeta} numberOfLines={1}>
              {trip.destination} · {formatDate(trip.startDate)} – {formatDate(trip.endDate)}
            </Text>
          </View>
        </LinearGradient>
      </View>

      <View style={styles.body}>
        <View style={styles.modeRow}>
          <MaterialCommunityIcons name={TRAVEL_MODE_ICONS[trip.travelMode]} size={14} color="#0f766e" />
          <Text style={styles.mode}>{travelModeText(trip.travelMode)}</Text>
        </View>
        <View style={styles.rowBetween}>
          <View style={styles.metaGroup}>
            <MaterialCommunityIcons name="account-multiple" size={14} color="#64748b" />
            <Text style={styles.meta}>
              {trip.seatsFilled}/{trip.seats} joined
            </Text>
          </View>
          <View style={styles.metaGroup}>
            <MaterialCommunityIcons
              name={trip.isLiked ? "heart" : "heart-outline"}
              size={14}
              color={trip.isLiked ? "#dc2626" : "#64748b"}
            />
            <Text style={styles.meta}>{trip._count.likes}</Text>
            <MaterialCommunityIcons name="comment-outline" size={14} color="#64748b" style={styles.metaIconSpacer} />
            <Text style={styles.meta}>{trip._count.comments}</Text>
            <MaterialCommunityIcons name="hand-front-right" size={14} color="#64748b" style={styles.metaIconSpacer} />
            <Text style={styles.meta}>{trip._count.joinRequests}</Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderRadius: 20,
    overflow: "hidden",
    marginBottom: 16,
    shadowColor: "#0f172a",
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  imageWrap: { width: "100%", height: 170 },
  image: { width: "100%", height: "100%" },
  imagePlaceholder: { alignItems: "flex-end", justifyContent: "flex-end", overflow: "hidden" },
  imagePlaceholderIcon: { marginRight: -18, marginBottom: -18 },
  imageScrim: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 14,
    paddingTop: 28,
    paddingBottom: 12,
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
  body: { padding: 14, paddingTop: 10, gap: 8 },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { fontSize: 17, fontWeight: "700", color: "#fff" },
  overlayMetaRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3 },
  overlayMeta: { fontSize: 12, color: "#e2e8f0", flexShrink: 1 },
  modeRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  mode: { fontSize: 12, fontWeight: "600", color: "#0f766e" },
  metaGroup: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaIconSpacer: { marginLeft: 6 },
  meta: { fontSize: 12, color: "#64748b" },
});
