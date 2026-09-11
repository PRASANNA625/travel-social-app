import { useState } from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { Trip } from "../types";
import { TRAVEL_MODE_ICONS, travelModeText } from "../utils/travelModeIcons";
import { TRIP_STATUS_COLORS, TRIP_STATUS_LABELS } from "../utils/tripStatus";
import { RADIUS } from "../theme/tokens";
import { useTheme } from "../theme/ThemeContext";
import { optimizedImageUrl } from "../utils/optimizedImage";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function TripCard({
  trip,
  onPress,
  onDelete,
  layout = "grid",
}: {
  trip: Trip;
  onPress: () => void;
  onDelete?: () => void;
  layout?: "grid" | "list";
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const { colors } = useTheme();

  if (layout === "list") {
    return (
      <TouchableOpacity
        style={[styles.listCard, { backgroundColor: colors.surfaceElevated, shadowColor: colors.ink, borderColor: colors.border }]}
        onPress={onPress}
        activeOpacity={0.9}
      >
        <View style={styles.listImageWrap}>
          {trip.images[0] && !imageFailed ? (
            <Image
              source={{ uri: optimizedImageUrl(trip.images[0], 200) }}
              style={styles.listImage}
              onError={() => setImageFailed(true)}
            />
          ) : (
            <LinearGradient colors={["#1d4ed8", "#0f766e"]} style={[styles.listImage, styles.listImagePlaceholder]}>
              <MaterialCommunityIcons name={TRAVEL_MODE_ICONS[trip.travelMode]} size={40} color="rgba(255,255,255,0.35)" />
            </LinearGradient>
          )}
        </View>

        <View style={styles.listBody}>
          <View style={styles.listTitleRow}>
            <Text style={[styles.listTitle, { color: colors.ink }]} numberOfLines={1}>
              {trip.title}
            </Text>
            <View style={[styles.listStatusPill, { backgroundColor: TRIP_STATUS_COLORS[trip.status] }]}>
              <Text style={styles.statusText}>{TRIP_STATUS_LABELS[trip.status]}</Text>
            </View>
          </View>

          <View style={styles.listMetaRow}>
            <MaterialCommunityIcons name="map-marker" size={13} color={colors.muted} />
            <Text style={[styles.listMetaText, { color: colors.muted }]} numberOfLines={1}>
              {trip.destination} · {formatDate(trip.startDate)} – {formatDate(trip.endDate)}
            </Text>
          </View>

          <View style={styles.listMetaRow}>
            <MaterialCommunityIcons name={TRAVEL_MODE_ICONS[trip.travelMode]} size={14} color={colors.primary} />
            <Text style={[styles.mode, { color: colors.primary }]}>{travelModeText(trip.travelMode)}</Text>
          </View>

          <View style={styles.listFooterRow}>
            <View style={styles.listOwnerRow}>
              {trip.owner.photoUrl ? (
                <Image source={{ uri: optimizedImageUrl(trip.owner.photoUrl, 48) }} style={styles.listOwnerAvatar} />
              ) : (
                <View style={[styles.listOwnerAvatar, styles.listOwnerAvatarPlaceholder]}>
                  <Text style={styles.listOwnerInitial}>{trip.owner.name.charAt(0).toUpperCase()}</Text>
                </View>
              )}
              <Text style={[styles.listOwnerName, { color: colors.ink }]} numberOfLines={1}>
                {trip.owner.name}
              </Text>
            </View>
            <View style={styles.metaGroup}>
              <MaterialCommunityIcons name="account-multiple" size={14} color={colors.muted} />
              <Text style={[styles.meta, { color: colors.muted }]}>
                {trip.seatsFilled}/{trip.seats} joined
              </Text>
            </View>
          </View>
        </View>

        {onDelete && (
          <TouchableOpacity style={styles.listDeleteButton} onPress={onDelete} hitSlop={8}>
            <MaterialCommunityIcons name="trash-can-outline" size={15} color={colors.danger} />
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.surfaceElevated, shadowColor: colors.ink }]}
      onPress={onPress}
      activeOpacity={0.9}
    >
      <View style={styles.imageWrap}>
        {trip.images[0] && !imageFailed ? (
          <Image
            source={{ uri: optimizedImageUrl(trip.images[0], 500) }}
            style={styles.image}
            onError={() => setImageFailed(true)}
          />
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

        <View style={[styles.statusPill, { backgroundColor: TRIP_STATUS_COLORS[trip.status] }]}>
          <Text style={styles.statusText}>{TRIP_STATUS_LABELS[trip.status]}</Text>
        </View>

        {onDelete && (
          <TouchableOpacity style={styles.deleteButton} onPress={onDelete} hitSlop={8}>
            <MaterialCommunityIcons name="trash-can-outline" size={15} color={colors.white} />
          </TouchableOpacity>
        )}

        <LinearGradient colors={["transparent", "rgba(15,23,42,0.88)"]} style={styles.imageScrim}>
          <Text style={styles.title} numberOfLines={1}>
            {trip.title}
          </Text>
          <View style={styles.overlayMetaRow}>
            <MaterialCommunityIcons name="map-marker" size={13} color={colors.border} />
            <Text style={styles.overlayMeta} numberOfLines={1}>
              {trip.destination} · {formatDate(trip.startDate)} – {formatDate(trip.endDate)}
              {typeof trip.distanceKm === "number"
                ? ` · ${trip.distanceKm < 1 ? "<1" : Math.round(trip.distanceKm)} km away`
                : ""}
            </Text>
          </View>
        </LinearGradient>
      </View>

      <View style={styles.body}>
        <View style={styles.modeRow}>
          <MaterialCommunityIcons name={TRAVEL_MODE_ICONS[trip.travelMode]} size={14} color={colors.primary} />
          <Text style={[styles.mode, { color: colors.primary }]}>{travelModeText(trip.travelMode)}</Text>
        </View>
        <View style={styles.rowBetween}>
          <View style={styles.metaGroup}>
            <MaterialCommunityIcons name="account-multiple" size={14} color={colors.muted} />
            <Text style={[styles.meta, { color: colors.muted }]}>
              {trip.seatsFilled}/{trip.seats} joined
            </Text>
          </View>
          <View style={styles.metaGroup}>
            <MaterialCommunityIcons
              name={trip.isLiked ? "heart" : "heart-outline"}
              size={14}
              color={trip.isLiked ? colors.danger : colors.muted}
            />
            <Text style={[styles.meta, { color: colors.muted }]}>{trip._count.likes}</Text>
            <MaterialCommunityIcons name="comment-outline" size={14} color={colors.muted} style={styles.metaIconSpacer} />
            <Text style={[styles.meta, { color: colors.muted }]}>{trip._count.comments}</Text>
            <MaterialCommunityIcons name="hand-front-right" size={14} color={colors.muted} style={styles.metaIconSpacer} />
            <Text style={[styles.meta, { color: colors.muted }]}>{trip._count.joinRequests}</Text>
            {trip.reviewCount > 0 && (
              <>
                <MaterialCommunityIcons name="star" size={14} color={colors.warningText} style={styles.metaIconSpacer} />
                <Text style={[styles.meta, { color: colors.muted }]}>
                  {(trip.avgRating ?? 0).toFixed(1)} ({trip.reviewCount})
                </Text>
              </>
            )}
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    overflow: "hidden",
    marginBottom: 16,
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
    borderRadius: RADIUS.pill,
  },
  statusText: { color: "#ffffff", fontSize: 10, fontWeight: "700" },
  deleteButton: {
    position: "absolute",
    top: 10,
    left: 10,
    backgroundColor: "rgba(15,23,42,0.6)",
    borderRadius: RADIUS.pill,
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  body: { padding: 14, paddingTop: 10, gap: 8 },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    rowGap: 4,
  },
  title: { fontSize: 17, fontWeight: "700", color: "#ffffff" },
  overlayMetaRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3 },
  overlayMeta: { fontSize: 12, color: "#e2e8f0", flexShrink: 1 },
  modeRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  mode: { fontSize: 12, fontWeight: "600" },
  metaGroup: { flexDirection: "row", alignItems: "center", gap: 4, flexShrink: 1 },
  metaIconSpacer: { marginLeft: 6 },
  meta: { fontSize: 12 },
  listCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderRadius: 20,
    borderWidth: 1,
    padding: 12,
    gap: 12,
    marginBottom: 16,
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  listImageWrap: { width: 96, height: 96, borderRadius: 16, overflow: "hidden" },
  listImage: { width: "100%", height: "100%" },
  listImagePlaceholder: { alignItems: "center", justifyContent: "center" },
  listBody: { flex: 1, gap: 6 },
  listTitleRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8 },
  listTitle: { flex: 1, fontSize: 15, fontWeight: "700" },
  listStatusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.pill },
  listMetaRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  listMetaText: { fontSize: 12, flexShrink: 1 },
  listFooterRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 2 },
  listOwnerRow: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1 },
  listOwnerAvatar: { width: 20, height: 20, borderRadius: 10 },
  listOwnerAvatarPlaceholder: { backgroundColor: "#0f766e", alignItems: "center", justifyContent: "center" },
  listOwnerInitial: { color: "#ffffff", fontSize: 10, fontWeight: "700" },
  listOwnerName: { fontSize: 12, fontWeight: "600", flexShrink: 1 },
  listDeleteButton: { padding: 4 },
});
