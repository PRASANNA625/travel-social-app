import type { ComponentProps } from "react";
import { Image, Platform, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AppStackParamList } from "../navigation/types";
import { useCompletedTrips, useUser } from "../api/users";
import { TRAVEL_MODE_ICONS, travelModeText } from "../utils/travelModeIcons";
import { GradientBackground } from "../components/theme/GradientBackground";
import { Card } from "../components/theme/Card";
import { Skeleton } from "../components/theme/Skeleton";
import { COLORS, RADIUS, TYPE } from "../theme/tokens";
import { optimizedImageUrl } from "../utils/optimizedImage";

type Props = NativeStackScreenProps<AppStackParamList, "UserProfile">;
type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

function StaticChip({ icon, label }: { icon?: IconName; label: string }) {
  return (
    <View style={styles.chip}>
      {icon && <MaterialCommunityIcons name={icon} size={14} color={COLORS.white} />}
      <Text style={styles.chipText}>{label}</Text>
    </View>
  );
}

function SectionHeader({ icon, title }: { icon: IconName; title: string }) {
  return (
    <View style={styles.blockHeaderRow}>
      <MaterialCommunityIcons name={icon} size={16} color={COLORS.ink} />
      <Text style={styles.blockTitle}>{title}</Text>
    </View>
  );
}

function UserProfileSkeleton() {
  return (
    <View style={styles.container}>
      <Skeleton style={styles.skeletonCover} />
      <View style={styles.sheet}>
        <View style={styles.page}>
          <View style={styles.headerBlock}>
            <Skeleton style={styles.skeletonAvatar} />
            <Skeleton style={styles.skeletonName} />
            <Skeleton style={styles.skeletonMeta} />
          </View>
        </View>
      </View>
    </View>
  );
}

export function UserProfileScreen({ route }: Props) {
  const { userId } = route.params;
  const { data: user, isLoading } = useUser(userId);
  const { data: completedTrips } = useCompletedTrips(userId);
  const isWeb = Platform.OS === "web";
  const { width: windowWidth } = useWindowDimensions();
  const coverHeight = Math.min(Math.max(windowWidth / 2.2, 200), 280);

  if (isLoading || !user) return <UserProfileSkeleton />;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <View style={[styles.coverWrap, { height: coverHeight }]}>
        {user.coverPhotoUrl ? (
          <>
            <Image source={{ uri: optimizedImageUrl(user.coverPhotoUrl, windowWidth) }} style={styles.cover} />
            <LinearGradient
              colors={["transparent", "rgba(12,20,38,0.15)", "rgba(12,20,38,0.6)"]}
              style={styles.coverScrim}
            />
          </>
        ) : (
          <GradientBackground style={styles.cover} />
        )}
      </View>

      <View style={styles.sheet}>
        <View style={[styles.page, isWeb && styles.pageWeb]}>
          <View style={styles.headerBlock}>
            <View style={styles.avatarWrap}>
              {user.photoUrl ? (
                <Image source={{ uri: optimizedImageUrl(user.photoUrl, 208) }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarPlaceholder]}>
                  <Text style={styles.avatarInitial}>{user.name.charAt(0).toUpperCase()}</Text>
                </View>
              )}
            </View>

            <Text style={styles.name}>{user.name}</Text>
            {(user.location || user.age != null) && (
              <View style={styles.metaRow}>
                {user.location && (
                  <View style={styles.metaItem}>
                    <MaterialCommunityIcons name="map-marker-outline" size={13} color={COLORS.muted} />
                    <Text style={styles.metaText}>{user.location}</Text>
                  </View>
                )}
                {user.age != null && (
                  <View style={styles.metaItem}>
                    <MaterialCommunityIcons name="cake-variant-outline" size={13} color={COLORS.muted} />
                    <Text style={styles.metaText}>{user.age} yrs</Text>
                  </View>
                )}
              </View>
            )}
            {user.bio && <Text style={styles.bio}>{user.bio}</Text>}
          </View>

          {user.interests.length > 0 && (
            <Card style={styles.section}>
              <SectionHeader icon="tag-multiple-outline" title="Travel interests" />
              <View style={styles.chipRow}>
                {user.interests.map((i) => (
                  <StaticChip key={i} icon="tag-outline" label={i} />
                ))}
              </View>
            </Card>
          )}

          {user.preferredModes.length > 0 && (
            <Card style={styles.section}>
              <SectionHeader icon="compass-outline" title="Preferred travel modes" />
              <View style={styles.chipRow}>
                {user.preferredModes.map((m) => (
                  <StaticChip key={m} icon={TRAVEL_MODE_ICONS[m]} label={travelModeText(m)} />
                ))}
              </View>
            </Card>
          )}

          <Card style={styles.section}>
            <SectionHeader icon="map-check-outline" title={`Previous trips (${completedTrips?.length ?? 0})`} />
            {completedTrips && completedTrips.length > 0 ? (
              completedTrips.map((t) => (
                <View key={t.id} style={styles.tripRow}>
                  <View style={styles.tripDot} />
                  <View style={styles.tripTextWrap}>
                    <Text style={styles.tripTitle} numberOfLines={1}>
                      {t.title}
                    </Text>
                    <Text style={styles.tripMeta} numberOfLines={1}>
                      {t.destination}
                    </Text>
                  </View>
                </View>
              ))
            ) : (
              <View style={styles.emptyWrap}>
                <MaterialCommunityIcons name="compass-off-outline" size={32} color={COLORS.mutedLight} />
                <Text style={styles.emptyText}>No completed trips yet.</Text>
              </View>
            )}
          </Card>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.fieldBg },
  scrollContent: { paddingBottom: 40 },
  coverWrap: { width: "100%" },
  cover: { width: "100%", height: "100%" },
  coverScrim: { position: "absolute", left: 0, right: 0, bottom: 0, height: "70%" },
  sheet: {
    marginTop: -26,
    backgroundColor: COLORS.fieldBg,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderTopWidth: 1,
    borderTopColor: "rgba(15,118,110,0.14)",
    paddingTop: 4,
  },
  page: { paddingHorizontal: 20 },
  pageWeb: { width: "100%", maxWidth: 640, alignSelf: "center" },
  headerBlock: { alignItems: "center" },
  avatarWrap: {
    marginTop: -58,
    borderRadius: 56,
    shadowColor: COLORS.ink,
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  avatar: { width: 104, height: 104, borderRadius: 52, borderWidth: 4, borderColor: COLORS.white },
  avatarPlaceholder: { backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center" },
  avatarInitial: { color: COLORS.white, fontSize: 34, fontWeight: "700" },
  name: { ...TYPE.heading, fontSize: 21, marginTop: 10 },
  metaRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 14, marginTop: 6 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaText: { fontSize: 13, color: COLORS.muted },
  bio: { ...TYPE.body, fontSize: 13.5, color: COLORS.muted, textAlign: "center", marginTop: 10, lineHeight: 20, maxWidth: 340 },
  section: { marginTop: 22, padding: 16, gap: 10 },
  blockHeaderRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  blockTitle: { fontWeight: "700", fontSize: 14.5, color: COLORS.ink },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.chip,
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  chipText: { fontSize: 12.5, color: COLORS.white, fontWeight: "600" },
  tripRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.field,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  tripDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: COLORS.primary },
  tripTextWrap: { flex: 1 },
  tripTitle: { fontSize: 14, fontWeight: "600", color: COLORS.ink },
  tripMeta: { fontSize: 12, color: COLORS.muted, marginTop: 1 },
  emptyWrap: {
    alignItems: "center",
    gap: 8,
    paddingVertical: 26,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.field,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  emptyText: { fontSize: 12.5, color: COLORS.mutedLight, textAlign: "center", paddingHorizontal: 32 },
  skeletonCover: { width: "100%", height: 220, borderRadius: 0 },
  skeletonAvatar: { width: 104, height: 104, borderRadius: 52, marginTop: -58 },
  skeletonName: { width: 140, height: 18, marginTop: 14 },
  skeletonMeta: { width: 100, height: 12, marginTop: 8 },
});
