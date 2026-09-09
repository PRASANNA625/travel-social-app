import { useMemo, useState } from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { Trip } from "../types";
import { TRAVEL_MODE_ICONS, travelModeText } from "../utils/travelModeIcons";
import { RADIUS } from "../theme/tokens";
import { useTheme } from "../theme/ThemeContext";
import type { Palette } from "../theme/palettes";
import { optimizedImageUrl } from "../utils/optimizedImage";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function TripMapPreviewCard({
  trip,
  onPress,
  onClose,
}: {
  trip: Trip;
  onPress: () => void;
  onClose: () => void;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.card}>
      <TouchableOpacity style={styles.closeButton} onPress={onClose} hitSlop={8}>
        <MaterialCommunityIcons name="close" size={16} color={colors.white} />
      </TouchableOpacity>
      <TouchableOpacity style={styles.body} onPress={onPress} activeOpacity={0.9}>
        {trip.images[0] && !imageFailed ? (
          <Image
            source={{ uri: optimizedImageUrl(trip.images[0], 200) }}
            style={styles.thumbnail}
            onError={() => setImageFailed(true)}
          />
        ) : (
          <View style={[styles.thumbnail, styles.thumbnailPlaceholder]}>
            <MaterialCommunityIcons name={TRAVEL_MODE_ICONS[trip.travelMode]} size={28} color={colors.white} />
          </View>
        )}
        <View style={styles.info}>
          <Text style={styles.title} numberOfLines={1}>
            {trip.title}
          </Text>
          <View style={styles.metaRow}>
            <MaterialCommunityIcons name="map-marker" size={12} color={colors.muted} />
            <Text style={styles.meta} numberOfLines={1}>
              {trip.destination} · {formatDate(trip.startDate)} – {formatDate(trip.endDate)}
              {typeof trip.distanceKm === "number"
                ? ` · ${trip.distanceKm < 1 ? "<1" : Math.round(trip.distanceKm)} km away`
                : ""}
            </Text>
          </View>
          <View style={styles.modeRow}>
            <MaterialCommunityIcons name={TRAVEL_MODE_ICONS[trip.travelMode]} size={13} color={colors.primary} />
            <Text style={styles.mode}>{travelModeText(trip.travelMode)}</Text>
          </View>
        </View>
      </TouchableOpacity>
    </View>
  );
}

function createStyles(colors: Palette) {
  return StyleSheet.create({
    card: {
      position: "absolute",
      left: 12,
      right: 12,
      bottom: 12,
      backgroundColor: colors.surfaceElevated,
      borderRadius: 18,
      shadowColor: colors.ink,
      shadowOpacity: 0.15,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 6 },
      elevation: 6,
    },
    closeButton: {
      position: "absolute",
      top: -10,
      right: -10,
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: colors.ink,
      alignItems: "center",
      justifyContent: "center",
      zIndex: 1,
    },
    body: { flexDirection: "row", padding: 12, gap: 12, alignItems: "center" },
    thumbnail: { width: 64, height: 64, borderRadius: 12 },
    thumbnailPlaceholder: { backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
    info: { flex: 1, gap: 4 },
    title: { fontSize: 14, fontWeight: "700", color: colors.ink },
    metaRow: { flexDirection: "row", alignItems: "center", gap: 4 },
    meta: { fontSize: 11.5, color: colors.muted, flexShrink: 1 },
    modeRow: { flexDirection: "row", alignItems: "center", gap: 4 },
    mode: { fontSize: 11.5, fontWeight: "600", color: colors.primary },
  });
}
