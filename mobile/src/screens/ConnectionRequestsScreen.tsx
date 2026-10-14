import { useMemo } from "react";
import { FlatList, Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AppStackParamList } from "../navigation/types";
import { usePendingBuddyRequests, useRespondToBuddyRequest } from "../api/buddies";
import type { BuddyConnection } from "../types";
import { Skeleton } from "../components/theme/Skeleton";
import { ScreenHeader } from "../components/theme/ScreenHeader";
import { EmptyState } from "../components/theme/EmptyState";
import { CONTROL, PAGE_WIDTH, RADIUS, SHADOW, pageGutter } from "../theme/tokens";
import { useResponsiveLayout } from "../theme/layout";
import { useTheme } from "../theme/ThemeContext";
import type { Palette } from "../theme/palettes";
import { optimizedImageUrl } from "../utils/optimizedImage";

type Props = NativeStackScreenProps<AppStackParamList, "ConnectionRequests">;

export function ConnectionRequestsScreen({ navigation }: Props) {
  const { data: requests, isLoading } = usePendingBuddyRequests();
  const respond = useRespondToBuddyRequest();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { isDesktop } = useResponsiveLayout();
  const listStyle = [styles.list, { paddingHorizontal: pageGutter(isDesktop) }];

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Connection Requests"
        subtitle="Travelers who'd like to be your travel buddy"
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
          contentContainerStyle={listStyle}
          data={requests ?? []}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={
            <EmptyState
              icon="account-heart-outline"
              title="No pending requests"
              message="When someone asks to be your travel buddy, it will show up here."
            />
          }
          renderItem={({ item }: { item: BuddyConnection }) => {
            const user = item.fromUser;
            return (
              <View style={styles.card}>
                <TouchableOpacity
                  style={styles.cardTop}
                  onPress={() => navigation.navigate("UserProfile", { userId: item.fromUserId })}
                  accessibilityRole="link"
                >
                  {user?.photoUrl ? (
                    <Image source={{ uri: optimizedImageUrl(user.photoUrl, 96) }} style={styles.avatar} />
                  ) : (
                    <View style={[styles.avatar, styles.avatarPlaceholder]}>
                      <Text style={styles.avatarInitial}>{(user?.name ?? "?").charAt(0).toUpperCase()}</Text>
                    </View>
                  )}
                  <View style={styles.identity}>
                    <Text style={styles.name} numberOfLines={1}>
                      {user?.name}
                    </Text>
                    {user?.location ? (
                      <View style={styles.metaRow}>
                        <MaterialCommunityIcons name="map-marker-outline" size={13} color={colors.muted} />
                        <Text style={styles.meta} numberOfLines={1}>
                          {user.location}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </TouchableOpacity>
                {user?.bio ? (
                  <Text style={styles.bio} numberOfLines={3}>
                    {user.bio}
                  </Text>
                ) : null}

                <View style={styles.actionsRow}>
                  <TouchableOpacity
                    style={[styles.actionButton, styles.decline]}
                    onPress={() => respond.mutate({ requestId: item.id, accept: false })}
                    accessibilityRole="button"
                  >
                    <Text style={styles.declineText}>Decline</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionButton, styles.accept]}
                    onPress={() => respond.mutate({ requestId: item.id, accept: true })}
                    accessibilityRole="button"
                  >
                    <MaterialCommunityIcons name="account-check-outline" size={16} color={colors.white} />
                    <Text style={styles.acceptText}>Accept</Text>
                  </TouchableOpacity>
                </View>
              </View>
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
    cardTop: { flexDirection: "row", alignItems: "center", gap: 12 },
    avatar: { width: 48, height: 48, borderRadius: 24 },
    avatarPlaceholder: { backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
    avatarInitial: { color: colors.white, fontWeight: "700", fontSize: 18 },
    identity: { flex: 1, minWidth: 0, gap: 3 },
    name: { fontSize: 16, fontWeight: "700", color: colors.ink },
    metaRow: { flexDirection: "row", alignItems: "center", gap: 3 },
    meta: { fontSize: 13, color: colors.muted, flexShrink: 1 },
    bio: { fontSize: 13.5, color: colors.muted, lineHeight: 19 },
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
    accept: { backgroundColor: colors.primary },
    acceptText: { color: colors.white, fontWeight: "700", fontSize: 14 },
    decline: { backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border },
    declineText: { color: colors.ink, fontWeight: "700", fontSize: 14 },
    skeletonName: { height: 16, width: "50%" },
    skeletonMeta: { height: 12, width: "35%" },
    skeletonAction: { flex: 1, height: CONTROL.buttonSmall, borderRadius: RADIUS.sm },
  });
}
