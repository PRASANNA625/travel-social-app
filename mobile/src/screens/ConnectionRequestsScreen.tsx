import { useMemo } from "react";
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AppStackParamList } from "../navigation/types";
import { usePendingBuddyRequests, useRespondToBuddyRequest } from "../api/buddies";
import type { BuddyConnection } from "../types";
import { Skeleton } from "../components/theme/Skeleton";
import { RADIUS } from "../theme/tokens";
import { useTheme } from "../theme/ThemeContext";
import type { Palette } from "../theme/palettes";

type Props = NativeStackScreenProps<AppStackParamList, "ConnectionRequests">;

export function ConnectionRequestsScreen({ navigation }: Props) {
  const { data: requests, isLoading } = usePendingBuddyRequests();
  const respond = useRespondToBuddyRequest();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

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
        contentContainerStyle={styles.list}
        data={requests ?? []}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <MaterialCommunityIcons name="account-heart-outline" size={40} color={colors.mutedLight} />
            <Text style={styles.empty}>No pending connection requests.</Text>
          </View>
        }
        renderItem={({ item }: { item: BuddyConnection }) => (
          <View style={styles.card}>
            <TouchableOpacity onPress={() => navigation.navigate("UserProfile", { userId: item.fromUserId })}>
              <Text style={styles.name}>{item.fromUser?.name}</Text>
            </TouchableOpacity>
            {item.fromUser?.location && <Text style={styles.meta}>📍 {item.fromUser.location}</Text>}
            {item.fromUser?.bio && <Text style={styles.meta}>{item.fromUser.bio}</Text>}

            <View style={styles.actionsRow}>
              <TouchableOpacity
                style={[styles.actionButton, styles.accept]}
                onPress={() => respond.mutate({ requestId: item.id, accept: true })}
              >
                <Text style={styles.actionText}>Accept</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, styles.reject]}
                onPress={() => respond.mutate({ requestId: item.id, accept: false })}
              >
                <Text style={styles.actionText}>Reject</Text>
              </TouchableOpacity>
            </View>
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
    name: { fontSize: 16, fontWeight: "700", color: colors.primary },
    meta: { fontSize: 13, color: colors.muted, marginTop: 2 },
    actionsRow: { flexDirection: "row", gap: 10, marginTop: 12 },
    actionButton: { flex: 1, padding: 10, borderRadius: 8, alignItems: "center" },
    accept: { backgroundColor: colors.primary },
    reject: { backgroundColor: colors.danger },
    actionText: { color: colors.white, fontWeight: "700" },
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
