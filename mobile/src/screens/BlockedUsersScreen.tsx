import { useMemo } from "react";
import { FlatList, Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AppStackParamList } from "../navigation/types";
import { useBlockedUsers, useUnblockUser } from "../api/safety";
import type { User } from "../types";
import { Skeleton } from "../components/theme/Skeleton";
import { optimizedImageUrl } from "../utils/optimizedImage";
import { PAGE_WIDTH, RADIUS, SHADOW, pageGutter } from "../theme/tokens";
import { useResponsiveLayout } from "../theme/layout";
import { ScreenHeader } from "../components/theme/ScreenHeader";
import { EmptyState } from "../components/theme/EmptyState";
import { useTheme } from "../theme/ThemeContext";
import type { Palette } from "../theme/palettes";

type Props = NativeStackScreenProps<AppStackParamList, "BlockedUsers">;

function BlockedUserRow({ user, styles }: { user: User; styles: ReturnType<typeof createStyles> }) {
  const unblockUser = useUnblockUser(user.id);
  return (
    <View style={styles.card}>
      {user.photoUrl ? (
        <Image source={{ uri: optimizedImageUrl(user.photoUrl, 44) }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, styles.avatarPlaceholder]}>
          <Text style={styles.avatarInitial}>{user.name.charAt(0).toUpperCase()}</Text>
        </View>
      )}
      <Text style={styles.name} numberOfLines={1}>
        {user.name}
      </Text>
      <TouchableOpacity style={styles.unblockButton} onPress={() => unblockUser.mutate()} disabled={unblockUser.isPending}>
        <Text style={styles.unblockText}>{unblockUser.isPending ? "…" : "Unblock"}</Text>
      </TouchableOpacity>
    </View>
  );
}

export function BlockedUsersScreen(_props: Props) {
  const { data: blockedUsers, isLoading } = useBlockedUsers();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { isDesktop } = useResponsiveLayout();
  const listStyle = [styles.list, { paddingHorizontal: pageGutter(isDesktop) }];

  return (
    <View style={styles.container}>
      <ScreenHeader title="Blocked Users" showBack maxWidth={PAGE_WIDTH.form} />
      {isLoading ? (
        <View style={listStyle}>
          {[0, 1].map((i) => (
            <View key={i} style={styles.card}>
              <Skeleton style={styles.skeletonAvatar} />
              <Skeleton style={styles.skeletonName} />
            </View>
          ))}
        </View>
      ) : (
        <FlatList
          contentContainerStyle={listStyle}
          data={blockedUsers ?? []}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={
            <EmptyState
              icon="account-off-outline"
              title="No blocked users"
              message="People you block won't be able to message you or see your activity."
            />
          }
          renderItem={({ item }) => <BlockedUserRow user={item} styles={styles} />}
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
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      backgroundColor: colors.surfaceElevated,
      borderRadius: RADIUS.card,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.border,
      ...SHADOW.card,
    },
    avatar: { width: 44, height: 44, borderRadius: 22 },
    avatarPlaceholder: { backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
    avatarInitial: { color: colors.white, fontWeight: "700", fontSize: 16 },
    name: { flex: 1, fontSize: 15, fontWeight: "600", color: colors.ink },
    unblockButton: {
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: RADIUS.pill,
      backgroundColor: colors.dangerBg,
    },
    unblockText: { color: colors.danger, fontWeight: "700", fontSize: 13 },
    skeletonAvatar: { width: 44, height: 44, borderRadius: 22 },
    skeletonName: { flex: 1, height: 16 },
  });
}
