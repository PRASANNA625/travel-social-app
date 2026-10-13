import { useState } from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { Trip } from "../types";
import { TRIP_STATUS_COLORS, TRIP_STATUS_LABELS } from "../utils/tripStatus";
import { RADIUS } from "../theme/tokens";
import { optimizedImageUrl } from "../utils/optimizedImage";
import { formatTripDate } from "./TripCard";
import { checkPlaceholderCover, fallbackCover } from "../utils/coverPhotos";

export const FEATURED_CARD_HEIGHT = 170;

// Full-bleed photo card used by the Discover carousels (Featured, Near You, ...).
export function FeaturedTripCard({ trip, onPress }: { trip: Trip; onPress: () => void }) {
  const [imageFailed, setImageFailed] = useState(false);

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.92}>
      <Image
        source={
          trip.images[0] && !imageFailed
            ? { uri: optimizedImageUrl(trip.images[0], 700) }
            : fallbackCover(trip)
        }
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
        onLoad={() => {
          if (!imageFailed && trip.images[0]) {
            checkPlaceholderCover(optimizedImageUrl(trip.images[0], 700), () => setImageFailed(true));
          }
        }}
        onError={() => setImageFailed(true)}
      />

      <View style={[styles.statusPill, { backgroundColor: TRIP_STATUS_COLORS[trip.status] }]}>
        <Text style={styles.statusText}>{TRIP_STATUS_LABELS[trip.status]}</Text>
      </View>

      <LinearGradient colors={["transparent", "rgba(15,23,42,0.85)"]} style={styles.scrim}>
        <Text style={styles.title} numberOfLines={1}>
          {trip.title}
        </Text>
        <View style={styles.metaRow}>
          <View style={styles.metaLeft}>
            <MaterialCommunityIcons name="map-marker" size={13} color="#e2e8f0" />
            <Text style={[styles.meta, styles.metaShrink]} numberOfLines={1}>
              {trip.destination}
            </Text>
            <MaterialCommunityIcons name="calendar-blank-outline" size={13} color="#e2e8f0" style={styles.spacer} />
            <Text style={styles.meta} numberOfLines={1}>
              {formatTripDate(trip.startDate)} – {formatTripDate(trip.endDate)}
            </Text>
          </View>
          <View style={styles.joinedPill}>
            {trip.owner.photoUrl ? (
              <Image source={{ uri: optimizedImageUrl(trip.owner.photoUrl, 48) }} style={styles.ownerAvatar} />
            ) : (
              <View style={[styles.ownerAvatar, styles.ownerAvatarPlaceholder]}>
                <Text style={styles.ownerInitial}>{trip.owner.name.charAt(0).toUpperCase()}</Text>
              </View>
            )}
            <Text style={styles.joinedText}>{trip.seatsFilled}</Text>
          </View>
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    height: FEATURED_CARD_HEIGHT,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#0c2b28",
  },
  statusPill: {
    position: "absolute",
    top: 10,
    right: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS.pill,
  },
  statusText: { color: "#ffffff", fontSize: 11, fontWeight: "700" },
  scrim: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 14, paddingTop: 36, paddingBottom: 12 },
  title: { color: "#ffffff", fontSize: 17, fontWeight: "700" },
  metaRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 4 },
  metaLeft: { flexDirection: "row", alignItems: "center", gap: 4, flexShrink: 1 },
  meta: { color: "#e2e8f0", fontSize: 12 },
  metaShrink: { flexShrink: 1 },
  spacer: { marginLeft: 6 },
  joinedPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderRadius: RADIUS.pill,
    paddingLeft: 2,
    paddingRight: 8,
    paddingVertical: 2,
  },
  ownerAvatar: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: "#ffffff" },
  ownerAvatarPlaceholder: { backgroundColor: "#0f766e", alignItems: "center", justifyContent: "center" },
  ownerInitial: { color: "#ffffff", fontSize: 10, fontWeight: "700" },
  joinedText: { color: "#ffffff", fontSize: 12, fontWeight: "700" },
});
