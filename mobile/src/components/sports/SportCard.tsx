import { useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { Trip } from "../../types";
import { useAuthStore } from "../../store/authStore";
import { useJoinTrip } from "../../api/joinRequests";
import { useTheme } from "../../theme/ThemeContext";
import { ACTION_BLUE, RADIUS, SHADOW } from "../../theme/tokens";
import { optimizedImageUrl } from "../../utils/optimizedImage";
import { Alert } from "../../utils/alert";
import { formatDistance } from "../TripCard";
import { SKILL_LABELS, SPORT_INFO, formatDuration, formatSportsTime, slotsLeft } from "../../utils/sports";

type Action = { label: string; icon: "check" | "clock-outline" | "email-outline" | "account-plus-outline" | "lock-outline" | "close"; kind: "primary" | "done" | "muted" };

// What the main button says for this viewer.
function joinAction(trip: Trip, isOwner: boolean): Action | null {
  if (isOwner) return null;
  switch (trip.viewerJoinStatus) {
    case "APPROVED":
      return { label: "You're in", icon: "check", kind: "done" };
    case "PENDING":
      return { label: "Requested", icon: "clock-outline", kind: "muted" };
    case "INVITED":
      return { label: "You're invited", icon: "email-outline", kind: "primary" };
    case "REJECTED":
      return { label: "Not this time", icon: "close", kind: "muted" };
  }
  if (trip.status === "CANCELLED") return { label: "Cancelled", icon: "close", kind: "muted" };
  if (trip.status === "COMPLETED") return { label: "Ended", icon: "close", kind: "muted" };
  if (trip.status === "FULL" || slotsLeft(trip) === 0) return { label: "Full", icon: "lock-outline", kind: "muted" };
  if (trip.joinType === "INVITE_ONLY") return { label: "Invite only", icon: "lock-outline", kind: "muted" };
  return { label: trip.joinType === "OPEN" ? "Join" : "Request to join", icon: "account-plus-outline", kind: "primary" };
}

export function SportCard({ trip, onPress, onInvite }: { trip: Trip; onPress: () => void; onInvite: () => void }) {
  const { colors } = useTheme();
  const me = useAuthStore((s) => s.user);
  const join = useJoinTrip();
  const [imageFailed, setImageFailed] = useState(false);
  const info = SPORT_INFO[trip.sport ?? "OTHER"];
  const isOwner = trip.ownerId === me?.id;
  const action = joinAction(trip, isOwner);
  const left = slotsLeft(trip);
  const filledPct = trip.seats ? Math.min(100, (trip.seatsFilled / trip.seats) * 100) : 0;
  const distance = formatDistance(trip.distanceKm);
  const photo = trip.images[0] && !imageFailed ? trip.images[0] : null;

  const onJoin = () => {
    // Invitations are answered on the detail page, where the invitee sees everything first.
    if (trip.viewerJoinStatus === "INVITED") return onPress();
    join.mutate(trip.id, {
      onSuccess: (req) =>
        Alert.alert(
          req.status === "APPROVED" ? "You're in!" : "Request sent",
          req.status === "APPROVED" ? `See you at ${trip.destination}.` : "The organizer will let you know."
        ),
      onError: (err: any) => Alert.alert("Couldn't join", err?.response?.data?.error ?? "Please try again"),
    });
  };

  return (
    <Pressable
      onPress={onPress}
      style={(state) => [
        styles.card,
        { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
        (state as { hovered?: boolean }).hovered && styles.cardHover,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${info.label}: ${trip.title}`}
    >
      <View style={styles.media}>
        {photo ? (
          <>
            <Image source={{ uri: optimizedImageUrl(photo, 600) }} style={StyleSheet.absoluteFill} onError={() => setImageFailed(true)} />
            <LinearGradient colors={["rgba(0,0,0,0.05)", "rgba(0,0,0,0.55)"]} style={StyleSheet.absoluteFill} />
          </>
        ) : (
          <LinearGradient colors={info.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill}>
            <MaterialCommunityIcons name={info.icon} size={120} color="rgba(255,255,255,0.16)" style={styles.watermark} />
            <View style={styles.bigIcon}>
              <MaterialCommunityIcons name={info.icon} size={34} color="#ffffff" />
            </View>
          </LinearGradient>
        )}
        <View style={styles.badgeRow}>
          <View style={styles.glassBadge}>
            <MaterialCommunityIcons name={info.icon} size={13} color="#ffffff" />
            <Text style={styles.glassText}>{info.label}</Text>
          </View>
          <View style={[styles.glassBadge, left === 0 && styles.fullBadge]}>
            <Text style={styles.glassText}>{left === 0 ? "Full" : `${left} spot${left === 1 ? "" : "s"} left`}</Text>
          </View>
        </View>
      </View>

      <View style={styles.body}>
        <Text style={[styles.title, { color: colors.ink }]} numberOfLines={2}>
          {trip.title}
        </Text>
        <View style={styles.row}>
          <MaterialCommunityIcons name="calendar-clock" size={15} color={colors.muted} />
          <Text style={[styles.meta, { color: colors.ink }]} numberOfLines={1}>
            {formatSportsTime(trip.startDate)}
            {trip.durationMinutes ? ` · ${formatDuration(trip.durationMinutes)}` : ""}
          </Text>
        </View>
        <View style={styles.row}>
          <MaterialCommunityIcons name="map-marker-outline" size={15} color={colors.muted} />
          <Text style={[styles.meta, { color: colors.ink }]} numberOfLines={1}>
            {trip.destination}
            {distance ? ` · ${distance}` : ""}
          </Text>
        </View>
        <View style={styles.tags}>
          <View style={[styles.tag, { backgroundColor: colors.fieldBg, borderColor: colors.border }]}>
            <MaterialCommunityIcons name="signal-cellular-2" size={12} color={colors.muted} />
            <Text style={[styles.tagText, { color: colors.ink }]}>{SKILL_LABELS[trip.skillLevel ?? "ANY"]}</Text>
          </View>
          <View style={[styles.tag, { backgroundColor: colors.fieldBg, borderColor: colors.border }]}>
            <Text style={[styles.tagText, { color: colors.ink }]}>{trip.budget ? `₹${trip.budget.toLocaleString()} each` : "Free"}</Text>
          </View>
        </View>

        <View style={styles.participants}>
          <View style={styles.participantsHead}>
            <Text style={[styles.organizer, { color: colors.muted }]} numberOfLines={1}>
              {isOwner ? "You're organizing" : `by ${trip.owner.name}`}
            </Text>
            <Text style={[styles.count, { color: colors.ink }]}>
              {trip.seatsFilled}/{trip.seats} spots filled
            </Text>
          </View>
          <View style={[styles.track, { backgroundColor: colors.fieldBg }]}>
            <View style={[styles.fill, { width: `${filledPct}%`, backgroundColor: info.colors[0] }]} />
          </View>
        </View>

        <View style={styles.actions}>
          {isOwner ? (
            <Pressable onPress={onInvite} style={[styles.button, styles.buttonPrimary]} accessibilityRole="button" accessibilityLabel={`Invite buddies to ${trip.title}`}>
              <MaterialCommunityIcons name="account-plus-outline" size={16} color="#ffffff" />
              <Text style={styles.buttonPrimaryText}>Invite</Text>
            </Pressable>
          ) : action ? (
            <Pressable
              onPress={action.kind === "primary" ? onJoin : onPress}
              disabled={join.isPending}
              style={[
                styles.button,
                action.kind === "primary" && styles.buttonPrimary,
                action.kind === "done" && { backgroundColor: colors.successBg },
                action.kind === "muted" && { backgroundColor: colors.fieldBg },
              ]}
              accessibilityRole="button"
            >
              <MaterialCommunityIcons name={action.icon} size={16} color={action.kind === "primary" ? "#ffffff" : action.kind === "done" ? colors.primary : colors.muted} />
              <Text
                style={[
                  styles.buttonText,
                  { color: action.kind === "primary" ? "#ffffff" : action.kind === "done" ? colors.primary : colors.muted },
                ]}
              >
                {join.isPending ? "Joining…" : action.label}
              </Text>
            </Pressable>
          ) : null}
          <Pressable onPress={onPress} style={[styles.button, styles.buttonGhost, { borderColor: colors.border }]} accessibilityRole="button">
            <Text style={[styles.buttonText, { color: colors.ink }]}>Details</Text>
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: RADIUS.card, borderWidth: 1, overflow: "hidden", ...SHADOW.card },
  cardHover: { transform: [{ translateY: -2 }], shadowOpacity: 0.12 },
  media: { height: 140, justifyContent: "space-between" },
  watermark: { position: "absolute", right: -18, bottom: -24 },
  bigIcon: { position: "absolute", left: 16, bottom: 14, width: 56, height: 56, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center" },
  badgeRow: { flexDirection: "row", justifyContent: "space-between", padding: 12, gap: 8 },
  glassBadge: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, height: 26, borderRadius: RADIUS.pill, backgroundColor: "rgba(15,23,42,0.42)" },
  fullBadge: { backgroundColor: "rgba(220,38,38,0.85)" },
  glassText: { color: "#ffffff", fontSize: 12, fontWeight: "700" },
  body: { padding: 14, gap: 8 },
  title: { fontSize: 16.5, fontWeight: "800", letterSpacing: -0.2, minHeight: 22 },
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
  meta: { fontSize: 13.5, flex: 1 },
  tags: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  tag: { flexDirection: "row", alignItems: "center", gap: 4, height: 26, paddingHorizontal: 10, borderRadius: RADIUS.pill, borderWidth: 1 },
  tagText: { fontSize: 12, fontWeight: "600" },
  participants: { gap: 6, marginTop: 2 },
  participantsHead: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  organizer: { fontSize: 12.5, flex: 1 },
  count: { fontSize: 12.5, fontWeight: "700" },
  track: { height: 6, borderRadius: 3, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 3 },
  actions: { flexDirection: "row", gap: 8, marginTop: 4 },
  button: { flex: 1, height: 40, borderRadius: RADIUS.pill, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 10 },
  buttonPrimary: { backgroundColor: ACTION_BLUE },
  buttonPrimaryText: { color: "#ffffff", fontSize: 14, fontWeight: "800" },
  buttonGhost: { borderWidth: 1, flex: 0, paddingHorizontal: 16 },
  buttonText: { fontSize: 14, fontWeight: "700" },
});
