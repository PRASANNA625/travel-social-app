import { useState } from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { Trip } from "../types";
import { TRAVEL_MODE_ICONS, travelModeText } from "../utils/travelModeIcons";
import { TRIP_STATUS_COLORS, TRIP_STATUS_LABELS } from "../utils/tripStatus";
import { RADIUS } from "../theme/tokens";
import { useTheme } from "../theme/ThemeContext";
import { optimizedImageUrl } from "../utils/optimizedImage";
import { useLikeTrip } from "../api/trips";
import { checkPlaceholderCover, fallbackCover } from "../utils/coverPhotos";

export function formatTripDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function formatDistance(distanceKm: number | null | undefined) {
  if (typeof distanceKm !== "number") return null;
  return `${distanceKm < 1 ? "<1" : Math.round(distanceKm)} km away`;
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
  const likeTrip = useLikeTrip();
  const distance = formatDistance(trip.distanceKm);

  // Uploaded cover first; trips without one (or whose upload fails) get their travel type's photo.
  const coverSource = (width: number) =>
    trip.images[0] && !imageFailed ? { uri: optimizedImageUrl(trip.images[0], width) } : fallbackCover(trip);
  const onCoverLoad = (width: number) => {
    if (!imageFailed && trip.images[0]) {
      checkPlaceholderCover(optimizedImageUrl(trip.images[0], width), () => setImageFailed(true));
    }
  };

  const toggleLike = () => likeTrip.mutate({ tripId: trip.id, input: !trip.isLiked });

  const stats = (
    <View style={styles.statsGroup}>
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
          <MaterialCommunityIcons name="star" size={14} color="#f59e0b" style={styles.metaIconSpacer} />
          <Text style={[styles.meta, { color: colors.muted }]}>
            {(trip.avgRating ?? 0).toFixed(1)} ({trip.reviewCount})
          </Text>
        </>
      )}
    </View>
  );

  const joined = (
    <View style={styles.statsGroup}>
      <MaterialCommunityIcons name="account-multiple" size={14} color={colors.muted} />
      <Text style={[styles.meta, { color: colors.muted }]}>
        {trip.seatsFilled}/{trip.seats} joined
      </Text>
    </View>
  );

  const modeChip = (
    <View style={[styles.modeChip, { backgroundColor: colors.primaryMuted }]}>
      <MaterialCommunityIcons name={TRAVEL_MODE_ICONS[trip.travelMode]} size={13} color={colors.primary} />
      <Text style={[styles.mode, { color: colors.primary }]} numberOfLines={1}>
        {travelModeText(trip.travelMode)}
      </Text>
    </View>
  );

  if (layout === "list") {
    return (
      <TouchableOpacity
        style={[styles.listCard, { backgroundColor: colors.surfaceElevated, shadowColor: colors.ink, borderColor: colors.border }]}
        onPress={onPress}
        activeOpacity={0.9}
      >
        <View style={styles.listImageWrap}>
          <Image source={coverSource(240)} style={styles.fill} resizeMode="cover" onLoad={() => onCoverLoad(240)} onError={() => setImageFailed(true)} />
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

          <View style={styles.metaRow}>
            <MaterialCommunityIcons name="map-marker-outline" size={13} color={colors.muted} />
            <Text style={[styles.metaText, { color: colors.muted }]} numberOfLines={1}>
              {trip.destination} · {formatTripDate(trip.startDate)} – {formatTripDate(trip.endDate)}
              {distance ? ` · ${distance}` : ""}
            </Text>
          </View>

          {modeChip}

          <View style={styles.footerRow}>
            {joined}
            {stats}
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
      style={[styles.card, { backgroundColor: colors.surfaceElevated, shadowColor: colors.ink, borderColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.9}
    >
      <View style={styles.imageWrap}>
        <Image source={coverSource(600)} style={styles.fill} resizeMode="cover" onLoad={() => onCoverLoad(600)} onError={() => setImageFailed(true)} />

        <View style={[styles.statusPill, { backgroundColor: TRIP_STATUS_COLORS[trip.status] }]}>
          <Text style={styles.statusText}>{TRIP_STATUS_LABELS[trip.status]}</Text>
        </View>

        {onDelete ? (
          <TouchableOpacity style={styles.imageButton} onPress={onDelete} hitSlop={8} accessibilityLabel="Delete trip">
            <MaterialCommunityIcons name="trash-can-outline" size={16} color={colors.white} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.imageButton}
            onPress={toggleLike}
            disabled={likeTrip.isPending}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={trip.isLiked ? "Unlike trip" : "Like trip"}
          >
            <MaterialCommunityIcons
              name={trip.isLiked ? "heart" : "heart-outline"}
              size={18}
              color={trip.isLiked ? "#f43f5e" : colors.white}
            />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.body}>
        <Text style={[styles.title, { color: colors.ink }]} numberOfLines={1}>
          {trip.title}
        </Text>
        <View style={styles.metaRow}>
          <MaterialCommunityIcons name="map-marker-outline" size={13} color={colors.muted} />
          <Text style={[styles.metaText, styles.metaShrink, { color: colors.muted }]} numberOfLines={1}>
            {trip.destination}
          </Text>
          <MaterialCommunityIcons name="calendar-blank-outline" size={13} color={colors.muted} style={styles.metaIconSpacer} />
          <Text style={[styles.metaText, { color: colors.muted }]} numberOfLines={1}>
            {formatTripDate(trip.startDate)} – {formatTripDate(trip.endDate)}
          </Text>
        </View>
        {distance && (
          <Text style={[styles.metaText, { color: colors.primary }]} numberOfLines={1}>
            {distance}
          </Text>
        )}
        {modeChip}
        <View style={[styles.footerRow, styles.cardFooter, { borderTopColor: colors.divider }]}>
          {joined}
          {stats}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  fill: { width: "100%", height: "100%" },
  card: {
    flexGrow: 1,
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: 16,
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  imageWrap: { width: "100%", height: 150, backgroundColor: "#0c2b28" },
  statusPill: {
    position: "absolute",
    top: 10,
    right: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS.pill,
  },
  statusText: { color: "#ffffff", fontSize: 11, fontWeight: "700" },
  imageButton: {
    position: "absolute",
    top: 10,
    left: 10,
    backgroundColor: "rgba(15,23,42,0.45)",
    borderRadius: RADIUS.pill,
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  body: { flexGrow: 1, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 12, gap: 8 },
  title: { fontSize: 16, fontWeight: "700" },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaText: { fontSize: 12.5 },
  metaShrink: { flexShrink: 1 },
  modeChip: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    maxWidth: "100%",
  },
  mode: { fontSize: 12, fontWeight: "600" },
  footerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    rowGap: 4,
    columnGap: 8,
  },
  cardFooter: { borderTopWidth: 1, paddingTop: 10, marginTop: "auto" },
  statsGroup: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaIconSpacer: { marginLeft: 8 },
  meta: { fontSize: 12 },
  listCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
    gap: 14,
    marginBottom: 14,
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  listImageWrap: { width: 120, height: 104, borderRadius: 12, overflow: "hidden", backgroundColor: "#0c2b28" },
  listBody: { flex: 1, gap: 7, minWidth: 0 },
  listTitleRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8 },
  listTitle: { flex: 1, fontSize: 15, fontWeight: "700" },
  listStatusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.pill },
  listDeleteButton: { padding: 4 },
});
