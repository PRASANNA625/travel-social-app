import { useMemo } from "react";
import { FlatList, Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AppStackParamList } from "../navigation/types";
import { useBlockedUsers, useUnblockUser } from "../api/safety";
import type { User } from "../types";
import { Skeleton } from "../components/theme/Skeleton";
import { optimizedImageUrl } from "../utils/optimizedImage";
import { RADIUS } from "../theme/tokens";
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

  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.list}>
          {[0, 1].map((i) => (
            <View key={i} style={styles.skeletonCard}>
              <Skeleton style={styles.skeletonAvatar} />
              <Skeleton style={styles.skeletonName} />
            </View>
          ))}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        contentContainerStyle={styles.list}
        data={blockedUsers ?? []}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <MaterialCommunityIcons name="account-off-outline" size={40} color={colors.mutedLight} />
            <Text style={styles.empty}>You haven't blocked anyone.</Text>
          </View>
        }
        renderItem={({ item }) => <BlockedUserRow user={item} styles={styles} />}
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
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      backgroundColor: colors.surfaceElevated,
      borderRadius: RADIUS.field,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.border,
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
    skeletonCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      backgroundColor: colors.surfaceElevated,
      borderRadius: RADIUS.field,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.border,
    },
    skeletonAvatar: { width: 44, height: 44, borderRadius: 22 },
    skeletonName: { flex: 1, height: 16 },
  });
}
