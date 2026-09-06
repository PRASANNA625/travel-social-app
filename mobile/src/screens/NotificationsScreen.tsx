import type { ComponentProps } from "react";
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { CompositeScreenProps } from "@react-navigation/native";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AppStackParamList, AppTabParamList } from "../navigation/types";
import { useMarkAllNotificationsRead, useMarkNotificationRead, useNotifications } from "../api/notifications";
import type { AppNotification } from "../types";
import { GradientBackground } from "../components/theme/GradientBackground";
import { Skeleton } from "../components/theme/Skeleton";
import { COLORS, RADIUS, TYPE } from "../theme/tokens";

type Props = CompositeScreenProps<
  BottomTabScreenProps<AppTabParamList, "Notifications">,
  NativeStackScreenProps<AppStackParamList>
>;

type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

function messagePreview(payload: Record<string, unknown>): string {
  if (payload.messageType === "IMAGE") return "📷 Photo";
  const content = typeof payload.content === "string" ? payload.content : "";
  return content.length > 60 ? `${content.slice(0, 60)}…` : content;
}

const NOTIFICATION_COPY: Record<string, (payload: Record<string, unknown>) => string> = {
  NEW_JOIN_REQUEST: (p) => `Someone wants to join "${p.tripTitle}"`,
  JOIN_REQUEST_APPROVED: (p) => `You're in! Your request for "${p.tripTitle}" was approved`,
  JOIN_REQUEST_REJECTED: (p) => `Your request for "${p.tripTitle}" wasn't approved`,
  GROUP_MESSAGE: (p) => `${p.senderName} in "${p.tripTitle}": ${messagePreview(p)}`,
};

function describe(notification: AppNotification): string {
  const formatter = NOTIFICATION_COPY[notification.type];
  return formatter ? formatter(notification.payload) : notification.type;
}

// Per-type icon + tint. Any notification type not listed here falls back to
// DEFAULT_ICON's chat-bubble glyph instead of rendering blank.
const NOTIFICATION_ICON: Record<string, { icon: IconName; bg: string; color: string }> = {
  NEW_JOIN_REQUEST: { icon: "account-multiple-plus", bg: COLORS.fieldBg, color: COLORS.primary },
  JOIN_REQUEST_APPROVED: { icon: "check-circle", bg: COLORS.successBg, color: COLORS.primary },
  JOIN_REQUEST_REJECTED: { icon: "close-circle-outline", bg: COLORS.dangerBg, color: COLORS.danger },
  GROUP_MESSAGE: { icon: "chat-processing-outline", bg: COLORS.successBg, color: COLORS.primary },
};
const DEFAULT_ICON: { icon: IconName; bg: string; color: string } = {
  icon: "message-text-outline",
  bg: COLORS.fieldBg,
  color: COLORS.muted,
};

function iconFor(type: string) {
  return NOTIFICATION_ICON[type] ?? DEFAULT_ICON;
}

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function NotificationsScreen({ navigation }: Props) {
  const { data, isLoading } = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const insets = useSafeAreaInsets();

  const unreadCount = data?.unreadCount ?? 0;

  const onPressNotification = (item: AppNotification) => {
    if (!item.read) markRead.mutate(item.id);
    if (item.type === "GROUP_MESSAGE") {
      const { groupId, tripTitle } = item.payload;
      if (typeof groupId === "string" && typeof tripTitle === "string") {
        navigation.navigate("GroupChat", { groupId, tripTitle });
      }
    }
  };

  return (
    <View style={styles.container}>
      <GradientBackground style={[styles.hero, { paddingTop: insets.top + 14 }]}>
        <View style={styles.heroRow}>
          <View style={styles.heroTitleRow}>
            <View style={styles.bellBadge}>
              <MaterialCommunityIcons name="bell-outline" size={20} color={COLORS.white} />
            </View>
            <View>
              <Text style={styles.heroTitle}>Notifications</Text>
              <Text style={styles.heroSubtitle}>Stay on top of your trip activity</Text>
            </View>
          </View>
          {unreadCount > 0 && (
            <TouchableOpacity
              style={styles.markAllButton}
              onPress={() => markAllRead.mutate()}
              disabled={markAllRead.isPending}
            >
              <MaterialCommunityIcons name="check-all" size={14} color={COLORS.white} />
              <Text style={styles.markAllText}>Mark all read</Text>
            </TouchableOpacity>
          )}
        </View>
      </GradientBackground>

      {isLoading ? (
        <View style={styles.list}>
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
          contentContainerStyle={styles.list}
          data={data?.items ?? []}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <MaterialCommunityIcons name="bell-check-outline" size={40} color={COLORS.mutedLight} />
              <Text style={styles.emptyTitle}>You're all caught up!</Text>
              <Text style={styles.emptySubtitle}>New activity on your trips will show up here.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const meta = iconFor(item.type);
            return (
              <TouchableOpacity
                style={[styles.item, !item.read && styles.itemUnread]}
                onPress={() => onPressNotification(item)}
                activeOpacity={0.85}
              >
                <View style={[styles.iconBadge, { backgroundColor: meta.bg }]}>
                  <MaterialCommunityIcons name={meta.icon} size={18} color={meta.color} />
                </View>
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.fieldBg },
  hero: { paddingHorizontal: 20, paddingBottom: 16 },
  heroRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  heroTitleRow: { flexDirection: "row", alignItems: "center", gap: 12, flexShrink: 1 },
  bellBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroTitle: { ...TYPE.heading, fontSize: 20, color: COLORS.white },
  heroSubtitle: { color: "rgba(255,255,255,0.85)", fontSize: 12.5, marginTop: 2 },
  markAllButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderRadius: RADIUS.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  markAllText: { color: COLORS.white, fontSize: 12, fontWeight: "700" },
  list: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 32, gap: 12 },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.field,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
  },
  itemUnread: {
    backgroundColor: "#f0fdfa",
    borderColor: COLORS.successBorderLight,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.primary,
  },
  iconBadge: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  itemBody: { flex: 1 },
  itemText: { ...TYPE.body, lineHeight: 20 },
  itemTextUnread: { fontWeight: "700" },
  itemTime: { fontSize: 11.5, color: COLORS.mutedLight, marginTop: 4 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.primary },
  emptyWrap: { alignItems: "center", gap: 8, marginTop: 36, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 15, fontWeight: "700", color: COLORS.ink },
  emptySubtitle: { fontSize: 13, color: COLORS.mutedLight, textAlign: "center" },
  itemSkeleton: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  skeletonLine: { height: 13, width: "80%" },
  skeletonLineShort: { height: 11, width: "35%", marginTop: 6 },
});
