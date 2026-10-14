import type { ComponentProps } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AppStackParamList } from "../navigation/types";
import { useJoinRequestsForTrip, useRespondToJoinRequest } from "../api/joinRequests";
import type { JoinRequest } from "../types";
import { Skeleton } from "../components/theme/Skeleton";
import { ScreenHeader } from "../components/theme/ScreenHeader";
import { EmptyState } from "../components/theme/EmptyState";
import { CONTROL, PAGE_WIDTH, RADIUS, SHADOW, pageGutter } from "../theme/tokens";
import { useResponsiveLayout } from "../theme/layout";
import { optimizedImageUrl } from "../utils/optimizedImage";
import { useTheme } from "../theme/ThemeContext";
import type { Palette } from "../theme/palettes";

type Props = NativeStackScreenProps<AppStackParamList, "JoinRequestsInbox">;
type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

function resolvedStatusMap(colors: Palette): Record<"APPROVED" | "REJECTED" | "INVITED", { icon: IconName; bg: string; color: string; label: string }> {
  return {
    APPROVED: { icon: "check-circle", bg: colors.successBg, color: colors.primary, label: "Approved" },
    REJECTED: { icon: "close-circle-outline", bg: colors.dangerBg, color: colors.danger, label: "Rejected" },
    INVITED: { icon: "email-outline", bg: colors.fieldBg, color: colors.muted, label: "Invited · waiting for reply" },
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
  const { isDesktop } = useResponsiveLayout();
  const listStyle = [styles.list, { paddingHorizontal: pageGutter(isDesktop) }];
  const tripTitle = requests?.find((r) => r.trip)?.trip?.title;

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

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Join Requests"
        subtitle={tripTitle ? `People who want to join "${tripTitle}"` : "People who want to join your trip"}
        showBack
        maxWidth={PAGE_WIDTH.form}
      />
      {isLoading ? (
        <View style={listStyle}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={styles.card}>
              <View style={styles.cardTop}>
                <Skeleton style={styles.avatar} />
                <View style={styles.identity}>
                  <Skeleton style={styles.skeletonName} />
                  <Skeleton style={styles.skeletonMeta} />
                </View>
              </View>
              <View style={styles.actionsRow}>
                <Skeleton style={styles.skeletonAction} />
                <Skeleton style={styles.skeletonAction} />
              </View>
            </View>
          ))}
        </View>
      ) : (
        <FlatList
          ref={listRef}
          contentContainerStyle={listStyle}
          data={requests ?? []}
          keyExtractor={(item) => item.id}
          onScrollToIndexFailed={onScrollToIndexFailed}
          ListEmptyComponent={
            <EmptyState
              icon="account-clock-outline"
              title="No requests yet"
              message="When someone asks to join this trip, you can approve or decline them here."
            />
          }
          renderItem={({ item }: { item: JoinRequest }) => (
            <View style={[styles.card, item.id === highlightedId && styles.cardHighlighted]}>
              <TouchableOpacity
                style={styles.cardTop}
                onPress={() => navigation.navigate("UserProfile", { userId: item.userId })}
                accessibilityRole="link"
              >
                {item.user?.photoUrl ? (
                  <Image source={{ uri: optimizedImageUrl(item.user.photoUrl, 96) }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, styles.avatarPlaceholder]}>
                    <Text style={styles.avatarInitial}>{(item.user?.name ?? "?").charAt(0).toUpperCase()}</Text>
                  </View>
                )}
                <View style={styles.identity}>
                  <Text style={styles.name} numberOfLines={1}>
                    {item.user?.name}
                  </Text>
                  {item.user?.location ? (
                    <View style={styles.metaRow}>
                      <MaterialCommunityIcons name="map-marker-outline" size={13} color={colors.muted} />
                      <Text style={styles.meta} numberOfLines={1}>
                        {item.user.location}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </TouchableOpacity>
              {item.user?.bio ? (
                <Text style={styles.bio} numberOfLines={3}>
                  {item.user.bio}
                </Text>
              ) : null}
              {item.message ? <Text style={styles.message}>"{item.message}"</Text> : null}

              {item.status === "PENDING" ? (
                <View style={styles.actionsRow}>
                  <TouchableOpacity
                    style={[styles.actionButton, styles.decline]}
                    onPress={() => respond.mutate({ requestId: item.id, approve: false })}
                    accessibilityRole="button"
                  >
                    <Text style={styles.declineText}>Decline</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionButton, styles.approve]}
                    onPress={() => respond.mutate({ requestId: item.id, approve: true })}
                    accessibilityRole="button"
                  >
                    <MaterialCommunityIcons name="check" size={16} color={colors.white} />
                    <Text style={styles.approveText}>Approve</Text>
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
      )}
    </View>
  );
}

function createStyles(colors: Palette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.surface },
    list: { width: "100%", maxWidth: PAGE_WIDTH.form, alignSelf: "center", paddingTop: 4, paddingBottom: 32, gap: 10 },
    card: {
      backgroundColor: colors.surfaceElevated,
      borderRadius: RADIUS.card,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 10,
      ...SHADOW.card,
    },
    cardHighlighted: {
      borderWidth: 2,
      borderColor: colors.warningText,
      shadowColor: colors.warningText,
      shadowOpacity: 0.35,
      shadowRadius: 6,
      elevation: 3,
    },
    cardTop: { flexDirection: "row", alignItems: "center", gap: 12 },
    avatar: { width: 48, height: 48, borderRadius: 24 },
    avatarPlaceholder: { backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
    avatarInitial: { color: colors.white, fontWeight: "700", fontSize: 18 },
    identity: { flex: 1, minWidth: 0, gap: 3 },
    name: { fontSize: 16, fontWeight: "700", color: colors.ink },
    metaRow: { flexDirection: "row", alignItems: "center", gap: 3 },
    meta: { fontSize: 13, color: colors.muted, flexShrink: 1 },
    bio: { fontSize: 13.5, color: colors.muted, lineHeight: 19 },
    message: {
      fontSize: 13.5,
      color: colors.ink,
      fontStyle: "italic",
      backgroundColor: colors.fieldBg,
      borderRadius: RADIUS.sm,
      padding: 10,
    },
    actionsRow: { flexDirection: "row", gap: 10 },
    actionButton: {
      flex: 1,
      flexDirection: "row",
      gap: 6,
      height: CONTROL.buttonSmall,
      borderRadius: RADIUS.sm,
      alignItems: "center",
      justifyContent: "center",
    },
    approve: { backgroundColor: colors.primary },
    approveText: { color: colors.white, fontWeight: "700", fontSize: 14 },
    decline: { backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border },
    declineText: { color: colors.ink, fontWeight: "700", fontSize: 14 },
    statusPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      alignSelf: "flex-start",
      borderRadius: RADIUS.pill,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    statusLabel: { fontSize: 12.5, fontWeight: "700" },
    skeletonName: { height: 16, width: "50%" },
    skeletonMeta: { height: 12, width: "35%" },
    skeletonAction: { flex: 1, height: CONTROL.buttonSmall, borderRadius: RADIUS.sm },
  });
}
