import { useMemo, useState } from "react";
import { FlatList, Image, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { CompositeScreenProps } from "@react-navigation/native";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AppStackParamList, AppTabParamList } from "../navigation/types";
import type { GroupInboxItem } from "../types";
import { useMyGroups } from "../api/groups";
import { useMe } from "../api/users";
import { Skeleton } from "../components/theme/Skeleton";
import { fallbackCover } from "../utils/coverPhotos";
import { optimizedImageUrl } from "../utils/optimizedImage";
import { formatRelativeTime } from "../utils/date";
import { ACTION_BLUE, PAGE_WIDTH, RADIUS, SHADOW, pageGutter } from "../theme/tokens";
import { useResponsiveLayout } from "../theme/layout";
import { ScreenHeader } from "../components/theme/ScreenHeader";
import { EmptyState } from "../components/theme/EmptyState";
import { useTheme } from "../theme/ThemeContext";
import type { Palette } from "../theme/palettes";

type Props = CompositeScreenProps<
  BottomTabScreenProps<AppTabParamList, "Messages">,
  NativeStackScreenProps<AppStackParamList>
>;

function previewText(item: GroupInboxItem, myId: string | undefined) {
  const last = item.lastMessage;
  if (!last) return "No messages yet — say hi 👋";
  const who = last.sender.id === myId ? "You" : last.sender.name.split(" ")[0];
  const body = last.removedAt
    ? "Message removed"
    : last.type === "IMAGE"
      ? "📷 Photo"
      : last.type === "AUDIO"
        ? "🎤 Voice message"
        : last.content ?? "";
  return `${who}: ${body}`;
}

function ChatRow({ item, myId, onPress }: { item: GroupInboxItem; myId?: string; onPress: () => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [coverFailed, setCoverFailed] = useState(false);
  const unread = item.unreadCount > 0;
  const cover =
    item.trip.images[0] && !coverFailed
      ? { uri: optimizedImageUrl(item.trip.images[0], 120) }
      : fallbackCover({ id: item.trip.id, travelMode: item.trip.travelMode });

  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.85} accessibilityRole="button">
      <Image source={cover} style={styles.cover} resizeMode="cover" onError={() => setCoverFailed(true)} />
      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <Text style={[styles.title, unread && styles.titleUnread]} numberOfLines={1}>
            {item.trip.title}
          </Text>
          <Text style={[styles.time, unread && styles.timeUnread]}>{formatRelativeTime(item.lastActivityAt)}</Text>
        </View>
        <View style={styles.rowBottom}>
          <Text style={[styles.preview, unread && styles.previewUnread]} numberOfLines={1}>
            {previewText(item, myId)}
          </Text>
          {unread && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{item.unreadCount > 99 ? "99+" : item.unreadCount}</Text>
            </View>
          )}
        </View>
        <View style={styles.metaRow}>
          <MaterialCommunityIcons name="map-marker-outline" size={12} color={colors.mutedLight} />
          <Text style={styles.meta} numberOfLines={1}>
            {item.trip.destination} · {item.memberCount} {item.memberCount === 1 ? "member" : "members"}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

export function MessagesScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { data, isLoading, isFetching, refetch } = useMyGroups();
  const { data: me } = useMe();
  const { isDesktop } = useResponsiveLayout();
  const gutter = pageGutter(isDesktop);

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Messages"
        subtitle="Group chats for every trip you've joined or created"
        maxWidth={PAGE_WIDTH.form}
      />
      <FlatList
        contentContainerStyle={[styles.list, { paddingHorizontal: gutter }]}
        data={data ?? []}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} />}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.skeletons}>
              {[0, 1, 2].map((i) => (
                <View key={i} style={styles.row}>
                  <Skeleton style={styles.cover} />
                  <View style={styles.rowBody}>
                    <Skeleton style={styles.skeletonLine} />
                    <Skeleton style={styles.skeletonLineShort} />
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <EmptyState
              icon="message-text-outline"
              title="No chats yet"
              message="Join or create a trip and its group chat will show up here."
              actionLabel="Discover trips"
              onAction={() => navigation.navigate("Discover")}
            />
          )
        }
        renderItem={({ item }) => (
          <ChatRow
            item={item}
            myId={me?.id}
            onPress={() => navigation.navigate("GroupChat", { groupId: item.id, tripTitle: item.trip.title })}
          />
        )}
      />
    </View>
  );
}

function createStyles(colors: Palette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.surface },
    list: { width: "100%", maxWidth: PAGE_WIDTH.form, alignSelf: "center", paddingTop: 4, paddingBottom: 40 },
    separator: { height: 10 },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      padding: 12,
      borderRadius: 16,
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.border,
      ...SHADOW.card,
    },
    cover: { width: 60, height: 60, borderRadius: 14, backgroundColor: colors.fieldBg },
    rowBody: { flex: 1, minWidth: 0, gap: 3 },
    rowTop: { flexDirection: "row", alignItems: "center", gap: 8 },
    title: { flex: 1, fontSize: 15, fontWeight: "600", color: colors.ink },
    titleUnread: { fontWeight: "800" },
    time: { fontSize: 12, color: colors.mutedLight },
    timeUnread: { color: ACTION_BLUE, fontWeight: "700" },
    rowBottom: { flexDirection: "row", alignItems: "center", gap: 8 },
    preview: { flex: 1, fontSize: 13.5, color: colors.muted },
    previewUnread: { color: colors.ink, fontWeight: "600" },
    badge: {
      minWidth: 22,
      height: 22,
      paddingHorizontal: 7,
      borderRadius: RADIUS.pill,
      backgroundColor: ACTION_BLUE,
      alignItems: "center",
      justifyContent: "center",
    },
    badgeText: { color: "#ffffff", fontSize: 11.5, fontWeight: "800" },
    metaRow: { flexDirection: "row", alignItems: "center", gap: 3 },
    meta: { fontSize: 12, color: colors.mutedLight, flexShrink: 1 },
    skeletons: { gap: 10 },
    skeletonLine: { height: 14, width: "60%" },
    skeletonLineShort: { height: 12, width: "40%" },
  });
}
