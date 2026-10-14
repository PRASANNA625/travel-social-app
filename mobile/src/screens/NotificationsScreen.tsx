import { useMemo } from "react";
import type { ComponentProps } from "react";
import { FlatList, Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { CompositeScreenProps } from "@react-navigation/native";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AppStackParamList, AppTabParamList } from "../navigation/types";
import { useMarkAllNotificationsRead, useMarkNotificationRead, useNotifications } from "../api/notifications";
import type { AppNotification } from "../types";
import { ScreenHeader } from "../components/theme/ScreenHeader";
import { EmptyState } from "../components/theme/EmptyState";
import { Skeleton } from "../components/theme/Skeleton";
import { optimizedImageUrl } from "../utils/optimizedImage";
import { FONT, PAGE_WIDTH, RADIUS, SHADOW, pageGutter } from "../theme/tokens";
import { useResponsiveLayout } from "../theme/layout";
import { useTheme } from "../theme/ThemeContext";
import type { Palette } from "../theme/palettes";
import { formatRelativeTime } from "../utils/date";

type Props = CompositeScreenProps<
  BottomTabScreenProps<AppTabParamList, "Notifications">,
  NativeStackScreenProps<AppStackParamList>
>;

type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

function messagePreview(payload: Record<string, unknown>): string {
  if (payload.messageType === "IMAGE") return "📷 Photo";
  if (payload.messageType === "AUDIO") return "🎙️ Voice message";
  const content = typeof payload.content === "string" ? payload.content : "";
  return content.length > 60 ? `${content.slice(0, 60)}…` : content;
}

const NOTIFICATION_COPY: Record<string, (payload: Record<string, unknown>) => string> = {
  NEW_JOIN_REQUEST: (p) => `Someone wants to join "${p.tripTitle}"`,
  JOIN_REQUEST_APPROVED: (p) => `You're in! Your request for "${p.tripTitle}" was approved`,
  JOIN_REQUEST_REJECTED: (p) => `Your request for "${p.tripTitle}" wasn't approved`,
  GROUP_MESSAGE: (p) => `${p.senderName} in "${p.tripTitle}": ${messagePreview(p)}`,
  MESSAGE_REACTION: (p) => `${p.reactorName} reacted ${p.emoji} to your message in "${p.tripTitle}": ${messagePreview(p)}`,
  TRIP_COMMENT: (p) => `${p.commenterName} commented on "${p.tripTitle}": ${messagePreview(p)}`,
  BUDDY_REQUEST: () => `Someone wants to be travel buddies`,
  BUDDY_REQUEST_ACCEPTED: () => `Your travel buddy request was accepted`,
  REPORT_RECEIVED: () => `Report received — our team will review it`,
  SYSTEM_ANNOUNCEMENT: (p) => `${p.title}: ${p.body}`,
  REMOVED_FROM_TRIP: (p) => `You were removed from "${p.tripTitle}" by the Triply team`,
  TRIP_REMOVED_BY_ADMIN: (p) => `Your trip "${p.tripTitle}" was removed by the Triply team${p.reason ? `: ${p.reason}` : ""}`,
};

function describe(notification: AppNotification): string {
  const formatter = NOTIFICATION_COPY[notification.type];
  return formatter ? formatter(notification.payload) : notification.type;
}

// Per-type icon + tint. Any notification type not listed here falls back to
// the chat-bubble glyph instead of rendering blank. Colors come from the
// active theme rather than being baked in, since this map is consulted at
// render time.
function notificationIconMap(colors: Palette): Record<string, { icon: IconName; bg: string; color: string }> {
  return {
    NEW_JOIN_REQUEST: { icon: "account-multiple-plus", bg: colors.fieldBg, color: colors.primary },
    JOIN_REQUEST_APPROVED: { icon: "check-circle", bg: colors.successBg, color: colors.primary },
    JOIN_REQUEST_REJECTED: { icon: "close-circle-outline", bg: colors.dangerBg, color: colors.danger },
    GROUP_MESSAGE: { icon: "chat-processing-outline", bg: colors.successBg, color: colors.primary },
    MESSAGE_REACTION: { icon: "heart-outline", bg: colors.successBg, color: colors.primary },
    TRIP_COMMENT: { icon: "comment-text-outline", bg: colors.fieldBg, color: colors.primary },
    BUDDY_REQUEST: { icon: "account-heart-outline", bg: colors.fieldBg, color: colors.primary },
    BUDDY_REQUEST_ACCEPTED: { icon: "check-circle", bg: colors.successBg, color: colors.primary },
    REPORT_RECEIVED: { icon: "flag-outline", bg: colors.fieldBg, color: colors.primary },
    SYSTEM_ANNOUNCEMENT: { icon: "bullhorn-outline", bg: colors.warningBg, color: colors.warningText },
    REMOVED_FROM_TRIP: { icon: "account-remove-outline", bg: colors.dangerBg, color: colors.danger },
    TRIP_REMOVED_BY_ADMIN: { icon: "map-marker-remove-outline", bg: colors.dangerBg, color: colors.danger },
  };
}

// The person whose action the notification is about, when it's someone
// other than the viewer - shown as the badge photo instead of the generic
// per-type icon (reactor for MESSAGE_REACTION, commenter for TRIP_COMMENT).
function actorPhotoUrl(item: AppNotification): string | null {
  const key = item.type === "MESSAGE_REACTION" ? "reactorPhotoUrl" : item.type === "TRIP_COMMENT" ? "commenterPhotoUrl" : null;
  const value = key ? item.payload[key] : null;
  return typeof value === "string" ? value : null;
}

function iconFor(type: string, colors: Palette) {
  return notificationIconMap(colors)[type] ?? { icon: "message-text-outline" as IconName, bg: colors.fieldBg, color: colors.muted };
}

export function NotificationsScreen({ navigation }: Props) {
  const { data, isLoading } = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const { isDesktop } = useResponsiveLayout();
  const gutter = pageGutter(isDesktop);
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const unreadCount = data?.unreadCount ?? 0;

  const onPressNotification = (item: AppNotification) => {
    if (!item.read) markRead.mutate(item.id);
    const { payload } = item;

    switch (item.type) {
      case "GROUP_MESSAGE":
      case "MESSAGE_REACTION": {
        const { groupId, tripTitle, messageId } = payload;
        if (typeof groupId === "string" && typeof tripTitle === "string") {
          navigation.navigate("GroupChat", {
            groupId,
            tripTitle,
            highlightMessageId: typeof messageId === "string" ? messageId : undefined,
          });
        }
        break;
      }
      case "TRIP_COMMENT": {
        const { tripId, commentId } = payload;
        if (typeof tripId === "string") {
          navigation.navigate("TripDetail", {
            tripId,
            highlightCommentId: typeof commentId === "string" ? commentId : undefined,
          });
        }
        break;
      }
      case "BUDDY_REQUEST": {
        navigation.navigate("ConnectionRequests");
        break;
      }
      case "BUDDY_REQUEST_ACCEPTED": {
        const { toUserId } = payload;
        if (typeof toUserId === "string") {
          navigation.navigate("UserProfile", { userId: toUserId });
        }
        break;
      }
      case "NEW_JOIN_REQUEST": {
        const { tripId, requestId } = payload;
        if (typeof tripId === "string") {
          navigation.navigate("JoinRequestsInbox", {
            tripId,
            highlightRequestId: typeof requestId === "string" ? requestId : undefined,
          });
        }
        break;
      }
      case "JOIN_REQUEST_APPROVED":
      case "JOIN_REQUEST_REJECTED":
      case "REMOVED_FROM_TRIP": {
        const { tripId } = payload;
        if (typeof tripId === "string") {
          navigation.navigate("TripDetail", { tripId });
        }
        break;
      }
      default:
        break;
    }
  };

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Notifications"
        subtitle="Stay on top of your trip activity"
        maxWidth={PAGE_WIDTH.form}
        right={
          unreadCount > 0 ? (
            <TouchableOpacity
              style={styles.markAllButton}
              onPress={() => markAllRead.mutate()}
              disabled={markAllRead.isPending}
              accessibilityRole="button"
            >
              <MaterialCommunityIcons name="check-all" size={15} color={colors.primary} />
              <Text style={styles.markAllText}>Mark all read</Text>
            </TouchableOpacity>
          ) : undefined
        }
      />

      {isLoading ? (
        <View style={[styles.list, { paddingHorizontal: gutter }]}>
          <View style={styles.itemSkeleton}>
            <Skeleton style={styles.iconBadge} />
            <View style={styles.itemBody}>
              <Skeleton style={styles.skeletonLine} />
              <Skeleton style={styles.skeletonLineShort} />
            </View>
          </View>
          <View style={styles.itemSkeleton}>
            <Skeleton style={styles.iconBadge} />
            <View style={styles.itemBody}>
              <Skeleton style={styles.skeletonLine} />
              <Skeleton style={styles.skeletonLineShort} />
            </View>
          </View>
          <View style={styles.itemSkeleton}>
            <Skeleton style={styles.iconBadge} />
            <View style={styles.itemBody}>
              <Skeleton style={styles.skeletonLine} />
              <Skeleton style={styles.skeletonLineShort} />
            </View>
          </View>
        </View>
      ) : (
        <FlatList
          contentContainerStyle={[styles.list, { paddingHorizontal: gutter }]}
          data={data?.items ?? []}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={
            <EmptyState
              icon="bell-check-outline"
              title="You're all caught up!"
              message="New activity on your trips will show up here."
            />
          }
          renderItem={({ item }) => {
            const meta = iconFor(item.type, colors);
            const photoUrl = actorPhotoUrl(item);
            return (
              <TouchableOpacity
                style={[styles.item, !item.read && styles.itemUnread]}
                onPress={() => onPressNotification(item)}
                activeOpacity={0.85}
              >
                {photoUrl ? (
                  <Image source={{ uri: optimizedImageUrl(photoUrl, 40) }} style={styles.avatarBadge} />
                ) : (
                  <View style={[styles.iconBadge, { backgroundColor: meta.bg }]}>
                    <MaterialCommunityIcons name={meta.icon} size={18} color={meta.color} />
                  </View>
                )}
                <View style={styles.itemBody}>
                  <Text style={[styles.itemText, !item.read && styles.itemTextUnread]}>{describe(item)}</Text>
                  <Text style={styles.itemTime}>{formatRelativeTime(item.createdAt)}</Text>
                </View>
                {!item.read && <View style={styles.unreadDot} />}
              </TouchableOpacity>
            );
          }}
        />
      )}
    </View>
  );
}

function createStyles(colors: Palette) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  markAllButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 36,
    backgroundColor: colors.primaryMuted,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 14,
  },
  markAllText: { color: colors.primary, fontSize: 13, fontWeight: "700" },
  list: { width: "100%", maxWidth: PAGE_WIDTH.form, alignSelf: "center", paddingTop: 4, paddingBottom: 32, gap: 10 },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.surfaceElevated,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    ...SHADOW.card,
  },
  itemUnread: {
    backgroundColor: colors.successBg,
    borderColor: colors.successBorderLight,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  iconBadge: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  avatarBadge: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.fieldBg },
  itemBody: { flex: 1 },
  itemText: { ...FONT.bodySmall, color: colors.ink, lineHeight: 20 },
  itemTextUnread: { fontWeight: "700" },
  itemTime: { fontSize: 11.5, color: colors.mutedLight, marginTop: 4 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary },
  itemSkeleton: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  skeletonLine: { height: 13, width: "80%" },
  skeletonLineShort: { height: 11, width: "35%", marginTop: 6 },
  });
}
