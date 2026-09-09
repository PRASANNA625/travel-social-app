import { useMemo, useState } from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { BuddyMatch } from "../types";
import { TRAVEL_MODE_ICONS, travelModeText } from "../utils/travelModeIcons";
import { RADIUS } from "../theme/tokens";
import { useTheme } from "../theme/ThemeContext";
import type { Palette } from "../theme/palettes";
import { optimizedImageUrl } from "../utils/optimizedImage";

const CONNECT_BUTTON_COPY: Record<BuddyMatch["connectionState"], { label: string; disabled: boolean }> = {
  none: { label: "Connect", disabled: false },
  pending_sent: { label: "Requested", disabled: true },
  pending_received: { label: "Respond", disabled: false },
  connected: { label: "Connected", disabled: true },
};

export function BuddyCard({
  buddy,
  onViewProfile,
  onConnect,
  onRespond,
}: {
  buddy: BuddyMatch;
  onViewProfile: () => void;
  onConnect: () => void;
  onRespond: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [imageFailed, setImageFailed] = useState(false);
  const buttonMeta = CONNECT_BUTTON_COPY[buddy.connectionState];
  const onButtonPress = buddy.connectionState === "pending_received" ? onRespond : onConnect;

  return (
    <TouchableOpacity style={styles.card} onPress={onViewProfile} activeOpacity={0.9}>
      {buddy.photoUrl && !imageFailed ? (
        <Image
          source={{ uri: optimizedImageUrl(buddy.photoUrl, 300) }}
          style={styles.avatar}
          onError={() => setImageFailed(true)}
        />
      ) : (
        <View style={[styles.avatar, styles.avatarPlaceholder]}>
          <Text style={styles.avatarInitial}>{buddy.name.charAt(0).toUpperCase()}</Text>
        </View>
      )}

      <Text style={styles.name} numberOfLines={1}>
        {buddy.name}
      </Text>
      {buddy.location && (
        <Text style={styles.meta} numberOfLines={1}>
          📍 {buddy.location}
        </Text>
      )}
      {buddy.bio && (
        <Text style={styles.bio} numberOfLines={2}>
          {buddy.bio}
        </Text>
      )}

      {(buddy.interests.length > 0 || buddy.preferredModes.length > 0) && (
        <View style={styles.chipRow}>
          {buddy.interests.slice(0, 2).map((interest) => (
            <View key={interest} style={styles.chip}>
              <Text style={styles.chipText}>{interest}</Text>
            </View>
          ))}
          {buddy.preferredModes.slice(0, 1).map((mode) => (
            <View key={mode} style={styles.chip}>
              <MaterialCommunityIcons name={TRAVEL_MODE_ICONS[mode]} size={12} color={colors.primary} />
              <Text style={styles.chipText}>{travelModeText(mode)}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.matchRow}>
        {buddy.compatibilityPercent !== null ? (
          <View style={styles.matchBadge}>
            <Text style={styles.matchBadgeText}>{buddy.compatibilityPercent}% match</Text>
          </View>
        ) : (
          <Text style={styles.matchText}>
            {buddy.sharedInterests.length > 0
              ? `${buddy.sharedInterests.length} shared interest${buddy.sharedInterests.length === 1 ? "" : "s"}`
              : buddy.sharedModesCount > 0
                ? `${buddy.sharedModesCount} shared travel mode${buddy.sharedModesCount === 1 ? "" : "s"}`
                : "New to Triply"}
          </Text>
        )}
      </View>

      <View style={styles.actionsRow}>
        <TouchableOpacity style={styles.secondaryButton} onPress={onViewProfile}>
          <Text style={styles.secondaryButtonText}>View Profile</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.primaryButton, buttonMeta.disabled && styles.primaryButtonDisabled]}
          onPress={onButtonPress}
          disabled={buttonMeta.disabled}
        >
          <Text style={styles.primaryButtonText}>{buttonMeta.label}</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

function createStyles(colors: Palette) {
  return StyleSheet.create({
    card: {
      width: 240,
      backgroundColor: colors.surfaceElevated,
      borderRadius: 20,
      padding: 14,
      alignItems: "center",
      shadowColor: colors.ink,
      shadowOpacity: 0.08,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 6 },
      elevation: 3,
    },
    avatar: { width: 72, height: 72, borderRadius: 36, marginBottom: 10 },
    avatarPlaceholder: { backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
    avatarInitial: { color: colors.white, fontWeight: "700", fontSize: 24 },
    name: { fontSize: 15, fontWeight: "700", color: colors.ink },
    meta: { fontSize: 12, color: colors.muted, marginTop: 2 },
    bio: { fontSize: 12, color: colors.muted, textAlign: "center", marginTop: 6, lineHeight: 16 },
    chipRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 6, marginTop: 10 },
    chip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      backgroundColor: colors.fieldBg,
      borderRadius: RADIUS.pill,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    chipText: { fontSize: 11, color: colors.ink, fontWeight: "600" },
    matchRow: { marginTop: 10 },
    matchBadge: { backgroundColor: colors.successBg, borderRadius: RADIUS.pill, paddingHorizontal: 10, paddingVertical: 4 },
    matchBadgeText: { fontSize: 12, fontWeight: "700", color: colors.primary },
    matchText: { fontSize: 12, color: colors.mutedLight },
    actionsRow: { flexDirection: "row", gap: 8, marginTop: 12, width: "100%" },
    secondaryButton: {
      flex: 1,
      paddingVertical: 9,
      borderRadius: RADIUS.field,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
    },
    secondaryButtonText: { fontSize: 12.5, fontWeight: "700", color: colors.ink },
    primaryButton: { flex: 1, paddingVertical: 9, borderRadius: RADIUS.field, backgroundColor: colors.primary, alignItems: "center" },
    primaryButtonDisabled: { backgroundColor: colors.mutedLight },
    primaryButtonText: { fontSize: 12.5, fontWeight: "700", color: colors.white },
  });
}
