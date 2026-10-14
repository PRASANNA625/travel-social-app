import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRespondToInvitation, type Invitation } from "../../api/joinRequests";
import { useTheme } from "../../theme/ThemeContext";
import { RADIUS, SHADOW } from "../../theme/tokens";
import { optimizedImageUrl } from "../../utils/optimizedImage";
import { Alert } from "../../utils/alert";
import { SPORT_INFO, formatDuration, formatSportsTime, isSports } from "../../utils/sports";
import { PrimaryButton } from "../theme/PrimaryButton";

const TRAVEL_COLORS: [string, string] = ["#2563eb", "#0f766e"];

function formatRange(startIso: string, endIso: string) {
  const fmt = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  return `${fmt(startIso)} – ${fmt(endIso)}`;
}

// A pending invitation to a trip or sports meetup, answerable in place.
export function InvitationCard({ invitation, onOpen }: { invitation: Invitation; onOpen: () => void }) {
  const { colors } = useTheme();
  const respond = useRespondToInvitation();
  const { trip } = invitation;
  const sports = isSports(trip);
  const info = sports ? SPORT_INFO[trip.sport ?? "OTHER"] : null;
  const photo = trip.images[0];
  const spotsLeft = Math.max(0, trip.seats - trip.seatsFilled);

  const answer = (accept: boolean) =>
    respond.mutate(
      { requestId: invitation.id, accept, tripId: trip.id },
      {
        onSuccess: () => {
          if (accept) Alert.alert("You're in!", sports ? `See you at ${trip.destination}.` : "You've been added to the group.");
        },
        onError: (err: any) => Alert.alert("Couldn't respond", err?.response?.data?.error ?? "Please try again"),
      }
    );

  return (
    <Pressable
      onPress={onOpen}
      style={[styles.card, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
      accessibilityRole="button"
      accessibilityLabel={`Invitation to ${trip.title} from ${trip.owner.name}`}
    >
      <View style={styles.top}>
        <View style={styles.thumb}>
          {photo ? (
            <Image source={{ uri: optimizedImageUrl(photo, 160) }} style={StyleSheet.absoluteFill} />
          ) : (
            <LinearGradient colors={info?.colors ?? TRAVEL_COLORS} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, styles.center]}>
              <MaterialCommunityIcons name={info?.icon ?? "airplane"} size={30} color="#ffffff" />
            </LinearGradient>
          )}
        </View>
        <View style={styles.text}>
          <Text style={[styles.kicker, { color: colors.primary }]} numberOfLines={1}>
            {trip.owner.name} invited you{info ? ` · ${info.label}` : ""}
          </Text>
          <Text style={[styles.title, { color: colors.ink }]} numberOfLines={2}>
            {trip.title}
          </Text>
          <View style={styles.metaRow}>
            <MaterialCommunityIcons name={sports ? "calendar-clock" : "calendar-range"} size={14} color={colors.muted} />
            <Text style={[styles.meta, { color: colors.muted }]} numberOfLines={1}>
              {sports
                ? `${formatSportsTime(trip.startDate)}${trip.durationMinutes ? ` · ${formatDuration(trip.durationMinutes)}` : ""}`
                : formatRange(trip.startDate, trip.endDate)}
            </Text>
          </View>
          <View style={styles.metaRow}>
            <MaterialCommunityIcons name="map-marker-outline" size={14} color={colors.muted} />
            <Text style={[styles.meta, { color: colors.muted }]} numberOfLines={1}>
              {trip.destination} · {spotsLeft === 0 ? "Full" : `${spotsLeft} spot${spotsLeft === 1 ? "" : "s"} left`}
            </Text>
          </View>
        </View>
      </View>
      <View style={styles.actions}>
        <PrimaryButton variant="outline" size="small" style={styles.flex} label="Decline" onPress={() => answer(false)} disabled={respond.isPending} />
        <PrimaryButton
          size="small"
          style={styles.flex}
          label="Accept"
          icon="check"
          onPress={() => answer(true)}
          disabled={respond.isPending || spotsLeft === 0}
          loading={respond.isPending}
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: RADIUS.card, borderWidth: 1, padding: 14, gap: 12, ...SHADOW.card },
  top: { flexDirection: "row", gap: 12 },
  thumb: { width: 76, height: 76, borderRadius: 14, overflow: "hidden" },
  center: { alignItems: "center", justifyContent: "center" },
  text: { flex: 1, minWidth: 0, gap: 3 },
  kicker: { fontSize: 12, fontWeight: "700" },
  title: { fontSize: 15.5, fontWeight: "800" },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  meta: { fontSize: 12.5, flex: 1 },
  actions: { flexDirection: "row", gap: 10 },
  flex: { flex: 1 },
});
