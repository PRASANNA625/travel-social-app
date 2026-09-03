import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AppStackParamList } from "../navigation/types";
import { useAuthStore } from "../store/authStore";
import { useAddComment, useBookmarkTrip, useLikeTrip, useTrip, useTripComments } from "../api/trips";
import { useExpressInterest } from "../api/joinRequests";
import { useMyJoinRequests } from "../api/joinRequests";
import { useGroupByTrip } from "../api/groups";
import { TRAVEL_MODE_LABELS, type Trip } from "../types";

type Props = NativeStackScreenProps<AppStackParamList, "TripDetail">;

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
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function TripDetailScreen({ route, navigation }: Props) {
  const { tripId } = route.params;
  const me = useAuthStore((s) => s.user);
  const { data: trip, isLoading } = useTrip(tripId);
  const { data: comments } = useTripComments(tripId);
  const { data: myRequests } = useMyJoinRequests();
  const { data: group } = useGroupByTrip(tripId);
  const [commentText, setCommentText] = useState("");

  const likeTrip = useLikeTrip();
  const bookmarkTrip = useBookmarkTrip();
  const expressInterest = useExpressInterest(tripId);
  const addComment = useAddComment(tripId);

  if (isLoading || !trip) {
    return <ActivityIndicator style={{ marginTop: 40 }} size="large" />;
  }

  const isOwner = trip.ownerId === me?.id;
  const myRequest = myRequests?.find((r) => r.tripId === tripId);
  const isMember = !!group?.members.some((m) => m.userId === me?.id);

  const onExpressInterest = () => {
    expressInterest.mutate(undefined, {
      onSuccess: (req) =>
        Alert.alert(
          req.status === "APPROVED" ? "You're in!" : "Request sent",
          req.status === "APPROVED"
            ? "This trip is open — you've been added to the group."
            : "The organizer will review your request soon."
        ),
      onError: (err: any) => Alert.alert("Couldn't send request", err?.response?.data?.error ?? "Try again"),
    });
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.hero}>
        {trip.images.length > 0 ? (
          <Image source={{ uri: trip.images[0] }} style={styles.heroImage} />
        ) : (
          <LinearGradient colors={["#2563eb", "#0f766e"]} style={styles.heroImage} />
        )}
        <View style={[styles.statusPill, { backgroundColor: STATUS_COLORS[trip.status] }]}>
          <Text style={styles.statusText}>{trip.status.replace("_", " ")}</Text>
        </View>
        <LinearGradient colors={["transparent", "rgba(15,23,42,0.9)"]} style={styles.heroScrim}>
          <Text style={styles.title}>{trip.title}</Text>
          <Text style={styles.heroSubtitle}>📍 {trip.destination}</Text>
        </LinearGradient>
      </View>

      {trip.images.length > 1 && (
        <FlatList
          horizontal
          data={trip.images.slice(1)}
          keyExtractor={(uri) => uri}
          renderItem={({ item }) => <Image source={{ uri: item }} style={styles.thumb} />}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.thumbRow}
        />
      )}

      <View style={styles.section}>
        <Text style={styles.subtitle}>
          🧭 {trip.startLocation} → {trip.destination}
        </Text>
        <Text style={styles.meta}>
          {formatDate(trip.startDate)} – {formatDate(trip.endDate)} · {TRAVEL_MODE_LABELS[trip.travelMode]}
        </Text>
        {trip.budget != null && <Text style={styles.meta}>💰 Approx. budget: ₹{trip.budget}</Text>}
        <Text style={styles.meta}>
          👥 {trip.seatsFilled}/{trip.seats} seats filled · Organized by {trip.owner.name}
        </Text>

        <View style={styles.actionsRow}>
          <TouchableOpacity
            onPress={() => likeTrip.mutate({ tripId, input: !trip.isLiked })}
            style={styles.iconAction}
          >
            <Text>{trip.isLiked ? "❤️" : "🤍"} {trip._count.likes}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => bookmarkTrip.mutate({ tripId, input: !trip.isBookmarked })}
            style={styles.iconAction}
          >
            <Text>{trip.isBookmarked ? "🔖 Saved" : "🔖 Save"}</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.description}>{trip.description}</Text>

        {trip.placesToVisit.length > 0 && (
          <View style={styles.block}>
            <Text style={styles.blockTitle}>Places to visit</Text>
            {trip.placesToVisit.map((place) => (
              <Text key={place} style={styles.listItem}>• {place}</Text>
            ))}
          </View>
        )}

        {trip.notes && (
          <View style={styles.block}>
            <Text style={styles.blockTitle}>Special notes</Text>
            <Text style={styles.meta}>{trip.notes}</Text>
          </View>
        )}

        {isOwner ? (
          <View style={{ gap: 8 }}>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => navigation.navigate("JoinRequestsInbox", { tripId })}
            >
              <Text style={styles.primaryButtonText}>🙋 View Join Requests ({trip._count.joinRequests})</Text>
            </TouchableOpacity>
            {group && (
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => navigation.navigate("GroupChat", { groupId: group.id, tripTitle: trip.title })}
              >
                <Text style={styles.secondaryButtonText}>💬 Open Group Chat</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : isMember && group ? (
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => navigation.navigate("GroupChat", { groupId: group.id, tripTitle: trip.title })}
          >
            <Text style={styles.primaryButtonText}>💬 Open Group Chat</Text>
          </TouchableOpacity>
        ) : myRequest?.status === "PENDING" ? (
          <View style={styles.pendingBadge}>
            <Text style={styles.pendingText}>⏳ Your request is pending approval</Text>
          </View>
        ) : myRequest?.status === "REJECTED" ? (
          <View style={styles.pendingBadge}>
            <Text style={styles.pendingText}>Your request wasn't approved for this trip</Text>
          </View>
        ) : trip.joinType === "INVITE_ONLY" ? (
          <View style={styles.pendingBadge}>
            <Text style={styles.pendingText}>🔒 Invite-only — ask the organizer to add you</Text>
          </View>
        ) : trip.status === "FULL" ? (
          <View style={styles.pendingBadge}>
            <Text style={styles.pendingText}>This trip is full</Text>
          </View>
        ) : (
          <TouchableOpacity style={styles.primaryButton} onPress={onExpressInterest} disabled={expressInterest.isPending}>
            <Text style={styles.primaryButtonText}>🙋 I'm Interested</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.blockTitle}>Comments ({comments?.length ?? 0})</Text>
        {comments?.map((c) => (
          <View key={c.id} style={styles.comment}>
            <Text style={styles.commentAuthor}>{c.user.name}</Text>
            <Text style={styles.meta}>{c.text}</Text>
          </View>
        ))}
        <View style={styles.commentInputRow}>
          <TextInput
            style={styles.commentInput}
            placeholder="Add a comment..."
            value={commentText}
            onChangeText={setCommentText}
          />
          <TouchableOpacity
            onPress={() => {
              if (!commentText.trim()) return;
              addComment.mutate(commentText.trim(), { onSuccess: () => setCommentText("") });
            }}
          >
            <Text style={styles.sendText}>Send</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  hero: { width: "100%", height: 260 },
  heroImage: { width: "100%", height: "100%" },
  statusPill: {
    position: "absolute",
    top: 14,
    right: 14,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
  },
  statusText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  heroScrim: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 16,
  },
  heroSubtitle: { fontSize: 13, color: "#e2e8f0", marginTop: 2 },
  thumbRow: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  thumb: { width: 72, height: 72, borderRadius: 10, marginRight: 8 },
  section: { padding: 16, borderBottomWidth: 8, borderBottomColor: "#f1f5f9" },
  title: { fontSize: 22, fontWeight: "700", color: "#fff" },
  subtitle: { fontSize: 15, color: "#334155", marginTop: 4 },
  meta: { fontSize: 13, color: "#64748b", marginTop: 4 },
  actionsRow: { flexDirection: "row", gap: 16, marginVertical: 12 },
  iconAction: { paddingVertical: 6, paddingHorizontal: 10, backgroundColor: "#f1f5f9", borderRadius: 8 },
  description: { fontSize: 14, color: "#1e293b", marginTop: 12, lineHeight: 20 },
  block: { marginTop: 16 },
  blockTitle: { fontSize: 15, fontWeight: "700", marginBottom: 6 },
  listItem: { fontSize: 13, color: "#334155", marginBottom: 2 },
  primaryButton: { backgroundColor: "#0f766e", borderRadius: 10, padding: 14, alignItems: "center", marginTop: 16 },
  primaryButtonText: { color: "#fff", fontWeight: "700" },
  secondaryButton: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#0f766e",
  },
  secondaryButtonText: { color: "#0f766e", fontWeight: "700" },
  pendingBadge: { backgroundColor: "#fef9c3", borderRadius: 10, padding: 12, marginTop: 16 },
  pendingText: { color: "#854d0e", textAlign: "center", fontSize: 13 },
  comment: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#f1f5f9" },
  commentAuthor: { fontWeight: "700", fontSize: 13 },
  commentInputRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 },
  commentInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  sendText: { color: "#0f766e", fontWeight: "700" },
});
