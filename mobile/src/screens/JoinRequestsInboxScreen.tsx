import type { ComponentProps } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AppStackParamList } from "../navigation/types";
import { useJoinRequestsForTrip, useRespondToJoinRequest } from "../api/joinRequests";
import type { JoinRequest } from "../types";
import { Skeleton } from "../components/theme/Skeleton";
import { RADIUS } from "../theme/tokens";
import { useTheme } from "../theme/ThemeContext";
import type { Palette } from "../theme/palettes";

type Props = NativeStackScreenProps<AppStackParamList, "JoinRequestsInbox">;
type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

function resolvedStatusMap(colors: Palette): Record<"APPROVED" | "REJECTED", { icon: IconName; bg: string; color: string; label: string }> {
  return {
    APPROVED: { icon: "check-circle", bg: colors.successBg, color: colors.primary, label: "Approved" },
    REJECTED: { icon: "close-circle-outline", bg: colors.dangerBg, color: colors.danger, label: "Rejected" },
  };
}

export function JoinRequestsInboxScreen({ route, navigation }: Props) {
  const { tripId, highlightRequestId } = route.params;
  const { data: requests, isLoading } = useJoinRequestsForTrip(tripId);
  const respond = useRespondToJoinRequest(tripId);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const listRef = useRef<FlatList<JoinRequest>>(null);
  const handledHighlightRef = useRef(!highlightRequestId);
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const resolvedStatus = useMemo(() => resolvedStatusMap(colors), [colors]);

  useEffect(() => {
    if (handledHighlightRef.current || !requests) return;
    const index = requests.findIndex((r) => r.id === highlightRequestId);
    if (index === -1) return;
    handledHighlightRef.current = true;
    setHighlightedId(highlightRequestId!);
    requestAnimationFrame(() => {
      listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.3 });
    });
    const timer = setTimeout(() => setHighlightedId(null), 2500);
    return () => clearTimeout(timer);
  }, [requests, highlightRequestId]);

  const onScrollToIndexFailed = ({ index }: { index: number }) => {
    listRef.current?.scrollToOffset({ offset: index * 140, animated: false });
    setTimeout(() => listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.3 }), 100);
  };

  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.list}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={styles.skeletonCard}>
              <Skeleton style={styles.skeletonName} />
              <Skeleton style={styles.skeletonMeta} />
              <View style={styles.skeletonActionsRow}>
                <Skeleton style={styles.skeletonAction} />
                <Skeleton style={styles.skeletonAction} />
              </View>
            </View>
          ))}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        ref={listRef}
        contentContainerStyle={styles.list}
        data={requests ?? []}
        keyExtractor={(item) => item.id}
        onScrollToIndexFailed={onScrollToIndexFailed}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <MaterialCommunityIcons name="account-clock-outline" size={40} color={colors.mutedLight} />
            <Text style={styles.empty}>No one has requested to join yet.</Text>
          </View>
        }
        renderItem={({ item }: { item: JoinRequest }) => (
          <View style={[styles.card, item.id === highlightedId && styles.cardHighlighted]}>
            <TouchableOpacity onPress={() => navigation.navigate("UserProfile", { userId: item.userId })}>
              <Text style={styles.name}>{item.user?.name}</Text>
            </TouchableOpacity>
            {item.user?.location && <Text style={styles.meta}>📍 {item.user.location}</Text>}
            {item.user?.bio && <Text style={styles.meta}>{item.user.bio}</Text>}
            {item.message && <Text style={styles.message}>"{item.message}"</Text>}

            {item.status === "PENDING" ? (
              <View style={styles.actionsRow}>
                <TouchableOpacity
                  style={[styles.actionButton, styles.approve]}
                  onPress={() => respond.mutate({ requestId: item.id, approve: true })}
                >
                  <Text style={styles.actionText}>Approve</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionButton, styles.reject]}
                  onPress={() => respond.mutate({ requestId: item.id, approve: false })}
                >
                  <Text style={styles.actionText}>Reject</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={[styles.statusPill, { backgroundColor: resolvedStatus[item.status].bg }]}>
                <MaterialCommunityIcons
                  name={resolvedStatus[item.status].icon}
                  size={14}
                  color={resolvedStatus[item.status].color}
                />
                <Text style={[styles.statusLabel, { color: resolvedStatus[item.status].color }]}>
                  {resolvedStatus[item.status].label}
                </Text>
              </View>
            )}
          </View>
        )}
      />
    </View>
  );
}

function createStyles(colors: Palette) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.fieldBg },
  list: { padding: 12, gap: 12 },
  empty: { textAlign: "center", color: colors.mutedLight },
  emptyWrap: { alignItems: "center", gap: 10, marginTop: 60, paddingHorizontal: 32 },
  card: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: RADIUS.field,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHighlighted: {
    borderWidth: 2,
    borderColor: colors.warningText,
    shadowColor: colors.warningText,
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 3,
  },
  name: { fontSize: 16, fontWeight: "700", color: colors.primary },
  meta: { fontSize: 13, color: colors.muted, marginTop: 2 },
  message: { fontSize: 13, color: colors.ink, marginTop: 6, fontStyle: "italic" },
  actionsRow: { flexDirection: "row", gap: 10, marginTop: 12 },
  actionButton: { flex: 1, padding: 10, borderRadius: 8, alignItems: "center" },
  approve: { backgroundColor: colors.primary },
  reject: { backgroundColor: colors.danger },
  actionText: { color: colors.white, fontWeight: "700" },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    borderRadius: RADIUS.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginTop: 10,
  },
  statusLabel: { fontSize: 12.5, fontWeight: "700" },
  skeletonCard: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: RADIUS.field,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 8,
  },
  skeletonName: { height: 16, width: "50%" },
  skeletonMeta: { height: 12, width: "70%" },
  skeletonActionsRow: { flexDirection: "row", gap: 10, marginTop: 4 },
  skeletonAction: { flex: 1, height: 38, borderRadius: 8 },
  });
}
