import { useMemo, useState, type ComponentProps } from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { BuddyMatch } from "../types";
import { RADIUS } from "../theme/tokens";
import { useTheme } from "../theme/ThemeContext";
import type { Palette } from "../theme/palettes";
import { optimizedImageUrl } from "../utils/optimizedImage";
import { fallbackCover } from "../utils/coverPhotos";
import { buddyTags } from "../utils/tagStyles";

type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

export const BUDDY_CARD_WIDTH = 260;
const COVER_HEIGHT = 112;
const AVATAR_SIZE = 84;

const CONNECT_BUTTON: Record<BuddyMatch["connectionState"], { label: string; icon: IconName; disabled: boolean }> = {
  none: { label: "Connect", icon: "account-plus-outline", disabled: false },
  pending_sent: { label: "Requested", icon: "clock-outline", disabled: true },
  pending_received: { label: "Respond", icon: "account-arrow-left-outline", disabled: false },
  connected: { label: "Connected", icon: "account-check-outline", disabled: true },
};

function subtitleFor(buddy: BuddyMatch) {
  if (buddy.sharedInterests.length > 0) {
    return `${buddy.sharedInterests.length} shared interest${buddy.sharedInterests.length === 1 ? "" : "s"}`;
  }
  if (buddy.sharedModesCount > 0) {
    return `${buddy.sharedModesCount} shared travel style${buddy.sharedModesCount === 1 ? "" : "s"}`;
  }
  return "New to Triply";
}

export function BuddyCard({
  buddy,
  onViewProfile,
  onConnect,
  onRespond,
  width = BUDDY_CARD_WIDTH,
}: {
  buddy: BuddyMatch;
  onViewProfile: () => void;
  onConnect: () => void;
  onRespond: () => void;
  width?: number;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [coverFailed, setCoverFailed] = useState(false);
  const button = CONNECT_BUTTON[buddy.connectionState];
  const onButtonPress = buddy.connectionState === "pending_received" ? onRespond : onConnect;
  const tags = buddyTags(buddy.interests, buddy.preferredModes, 3);
  const hasStats = buddy.tripCount > 0 || buddy.rating !== null;

  // Their own cover photo when set; otherwise a scenic photo matching their main travel style.
  const cover =
    buddy.coverPhotoUrl && !coverFailed
      ? { uri: optimizedImageUrl(buddy.coverPhotoUrl, Math.round(width * 2)) }
      : fallbackCover({ id: buddy.id, travelMode: buddy.preferredModes[0] ?? "OTHER" });

  return (
    <TouchableOpacity style={[styles.card, { width }]} onPress={onViewProfile} activeOpacity={0.92}>
      <View style={styles.cover}>
        <Image source={cover} style={styles.coverImage} resizeMode="cover" onError={() => setCoverFailed(true)} />
        {buddy.compatibilityPercent !== null && (
          <View style={styles.matchPill}>
            <MaterialCommunityIcons name="heart-multiple" size={12} color="#ffffff" />
            <Text style={styles.matchPillText}>{buddy.compatibilityPercent}% match</Text>
          </View>
        )}
      </View>

      <View style={styles.avatarRing}>
        {buddy.photoUrl && !avatarFailed ? (
          <Image
            source={{ uri: optimizedImageUrl(buddy.photoUrl, AVATAR_SIZE * 2) }}
            style={styles.avatar}
            onError={() => setAvatarFailed(true)}
          />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder]}>
            <Text style={styles.avatarInitial}>{buddy.name.charAt(0).toUpperCase()}</Text>
          </View>
        )}
        {buddy.online && <View style={styles.onlineDot} accessibilityLabel="Online" />}
      </View>

      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={1}>
          {buddy.name}
        </Text>
        <View style={styles.locationRow}>
          {buddy.location ? (
            <>
              <MaterialCommunityIcons name="map-marker" size={14} color="#ef4444" />
              <Text style={styles.location} numberOfLines={1}>
                {buddy.location}
              </Text>
            </>
          ) : (
            <Text style={styles.location}>Location not shared</Text>
          )}
        </View>

        <View style={styles.tags}>
          {tags.map((tag) => (
            <View key={tag.label} style={[styles.tag, { backgroundColor: tag.bg }]}>
              <MaterialCommunityIcons name={tag.icon} size={13} color={tag.color} />
              <Text style={[styles.tagText, { color: tag.color }]} numberOfLines={1}>
                {tag.label}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.statsRow}>
          {hasStats ? (
            <>
              <MaterialCommunityIcons name="account-group" size={15} color="#2563eb" />
              <Text style={styles.statText}>
                {buddy.tripCount} trip{buddy.tripCount === 1 ? "" : "s"}
              </Text>
              {buddy.rating !== null && (
                <>
                  <View style={styles.statDivider} />
                  <MaterialCommunityIcons name="star" size={15} color="#f59e0b" />
                  <Text style={styles.statTextStrong}>{buddy.rating.toFixed(1)}</Text>
                </>
              )}
            </>
          ) : (
            <Text style={styles.statMuted}>{subtitleFor(buddy)}</Text>
          )}
        </View>

        <View style={styles.actions}>
          <TouchableOpacity style={styles.secondaryButton} onPress={onViewProfile} accessibilityRole="button">
            <Text style={styles.secondaryButtonText} numberOfLines={1}>
              View Profile
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.primaryButton, button.disabled && styles.primaryButtonDisabled]}
            onPress={onButtonPress}
            disabled={button.disabled}
            accessibilityRole="button"
          >
            <MaterialCommunityIcons name={button.icon} size={16} color="#ffffff" />
            <Text style={styles.primaryButtonText} numberOfLines={1}>
              {button.label}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
}

function createStyles(colors: Palette) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.surfaceElevated,
      borderRadius: 20,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: colors.ink,
      shadowOpacity: 0.07,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 6 },
      elevation: 3,
    },
    cover: { height: COVER_HEIGHT, backgroundColor: "#0c2b28" },
    coverImage: { width: "100%", height: "100%" },
    matchPill: {
      position: "absolute",
      top: 10,
      left: 10,
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      backgroundColor: "rgba(15,118,110,0.92)",
      borderRadius: RADIUS.pill,
      paddingHorizontal: 9,
      paddingVertical: 4,
    },
    matchPillText: { color: "#ffffff", fontSize: 11, fontWeight: "700" },
    avatarRing: {
      alignSelf: "center",
      marginTop: -AVATAR_SIZE / 2,
      width: AVATAR_SIZE + 8,
      height: AVATAR_SIZE + 8,
      borderRadius: (AVATAR_SIZE + 8) / 2,
      backgroundColor: colors.surfaceElevated,
      alignItems: "center",
      justifyContent: "center",
    },
    avatar: { width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: AVATAR_SIZE / 2 },
    avatarPlaceholder: { backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
    avatarInitial: { color: colors.white, fontWeight: "800", fontSize: 30 },
    onlineDot: {
      position: "absolute",
      right: 8,
      bottom: 8,
      width: 16,
      height: 16,
      borderRadius: 8,
      backgroundColor: "#22c55e",
      borderWidth: 3,
      borderColor: colors.surfaceElevated,
    },
    body: { paddingHorizontal: 12, paddingBottom: 12, alignItems: "center" },
    name: { fontSize: 16.5, fontWeight: "800", color: colors.ink, marginTop: 4, maxWidth: "100%" },
    locationRow: { flexDirection: "row", alignItems: "center", gap: 3, height: 20, marginTop: 2, maxWidth: "100%" },
    location: { fontSize: 13, color: colors.muted, flexShrink: 1 },
    // Fixed two-row tag area keeps every card the same height.
    tags: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "center",
      alignContent: "center",
      gap: 6,
      height: 62,
      marginTop: 10,
      overflow: "hidden",
    },
    tag: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      height: 28,
      borderRadius: RADIUS.pill,
      paddingHorizontal: 10,
      maxWidth: "100%",
    },
    tagText: { fontSize: 12.5, fontWeight: "600", flexShrink: 1 },
    statsRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, height: 22, marginTop: 6 },
    statText: { fontSize: 13, color: colors.muted },
    statTextStrong: { fontSize: 13, color: colors.ink, fontWeight: "700" },
    statDivider: { width: 1, height: 14, backgroundColor: colors.border, marginHorizontal: 6 },
    statMuted: { fontSize: 13, color: colors.mutedLight },
    actions: { flexDirection: "row", gap: 8, marginTop: 12, width: "100%" },
    secondaryButton: {
      flex: 1,
      height: 42,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 6,
    },
    secondaryButtonText: { fontSize: 13.5, fontWeight: "700", color: colors.ink },
    primaryButton: {
      flex: 1,
      height: 42,
      borderRadius: 12,
      backgroundColor: colors.primary,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingHorizontal: 6,
    },
    primaryButtonDisabled: { backgroundColor: "#a8b6c8" },
    primaryButtonText: { fontSize: 13.5, fontWeight: "700", color: "#ffffff", flexShrink: 1 },
  });
}
