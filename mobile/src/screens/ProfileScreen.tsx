import type { ComponentProps } from "react";
import { ActivityIndicator, Image, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { CompositeScreenProps } from "@react-navigation/native";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AppStackParamList, AppTabParamList } from "../navigation/types";
import { useAuthStore } from "../store/authStore";
import { useCompletedTrips, useMe, useUploadCoverPhoto, useUploadProfilePhoto } from "../api/users";
import { TRAVEL_MODE_ICONS, travelModeText } from "../utils/travelModeIcons";
import { Alert } from "../utils/alert";

type Props = CompositeScreenProps<
  BottomTabScreenProps<AppTabParamList, "Profile">,
  NativeStackScreenProps<AppStackParamList>
>;
type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

export function ProfileScreen({ navigation }: Props) {
  const { data: user, isLoading } = useMe();
  const { data: completedTrips } = useCompletedTrips(user?.id);
  const uploadPhoto = useUploadProfilePhoto();
  const uploadCover = useUploadCoverPhoto();
  const logout = useAuthStore((s) => s.logout);
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";

  const onChangePhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7 });
    if (result.canceled) return;
    uploadPhoto.mutate(result.assets[0], {
      onError: () => Alert.alert("Couldn't upload photo", "Please try again"),
    });
  };

  const onChangeCover = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7 });
    if (result.canceled) return;
    uploadCover.mutate(result.assets[0], {
      onError: () => Alert.alert("Couldn't upload cover photo", "Please try again"),
    });
  };

  if (isLoading || !user) return <ActivityIndicator style={{ marginTop: 40 }} size="large" />;

  const stats: { icon: IconName; label: string; value: number }[] = [
    { icon: "map-check-outline", label: "Completed", value: completedTrips?.length ?? 0 },
    { icon: "tag-multiple-outline", label: "Interests", value: user.interests.length },
    { icon: "compass-outline", label: "Travel modes", value: user.preferredModes.length },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <View style={[styles.coverWrap, isWeb && styles.coverWrapWeb]}>
        {user.coverPhotoUrl ? (
          <Image source={{ uri: user.coverPhotoUrl }} style={styles.cover} />
        ) : (
          <LinearGradient colors={["#1d4ed8", "#0f766e"]} style={styles.cover} />
        )}
        <TouchableOpacity
          style={[styles.coverEditButton, { top: insets.top + 12 }]}
          onPress={onChangeCover}
          disabled={uploadCover.isPending}
        >
          {uploadCover.isPending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <MaterialCommunityIcons name="camera-outline" size={14} color="#fff" />
              <Text style={styles.coverEditText}>Cover</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      <View style={[styles.page, isWeb && styles.pageWeb]}>
        <View style={styles.headerBlock}>
          <TouchableOpacity onPress={onChangePhoto} style={styles.avatarWrap} disabled={uploadPhoto.isPending}>
            {user.photoUrl ? (
              <Image source={{ uri: user.photoUrl }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder]}>
                <Text style={styles.avatarInitial}>{user.name.charAt(0).toUpperCase()}</Text>
              </View>
            )}
            <View style={styles.avatarEditBadge}>
              {uploadPhoto.isPending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <MaterialCommunityIcons name="camera-outline" size={14} color="#fff" />
              )}
            </View>
          </TouchableOpacity>

          <Text style={styles.name}>{user.name}</Text>
          {(user.location || user.age != null) && (
            <View style={styles.metaRow}>
              {user.location && (
                <View style={styles.metaItem}>
                  <MaterialCommunityIcons name="map-marker-outline" size={13} color="#64748b" />
                  <Text style={styles.metaText}>{user.location}</Text>
                </View>
              )}
              {user.age != null && (
                <View style={styles.metaItem}>
                  <MaterialCommunityIcons name="cake-variant-outline" size={13} color="#64748b" />
                  <Text style={styles.metaText}>{user.age} yrs</Text>
                </View>
              )}
            </View>
          )}
          {user.bio && <Text style={styles.bio}>{user.bio}</Text>}
        </View>

        <View style={styles.statsRow}>
          {stats.map((s) => (
            <View key={s.label} style={styles.statCard}>
              <MaterialCommunityIcons name={s.icon} size={20} color="#0f766e" />
              <Text style={styles.statValue}>{s.value}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        {user.interests.length > 0 && (
          <View style={styles.block}>
            <View style={styles.blockHeaderRow}>
              <MaterialCommunityIcons name="tag-multiple-outline" size={16} color="#0f172a" />
              <Text style={styles.blockTitle}>Travel interests</Text>
            </View>
            <View style={styles.chipRow}>
              {user.interests.map((i) => (
                <View key={i} style={styles.chip}>
                  <Text style={styles.chipText}>{i}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {user.preferredModes.length > 0 && (
          <View style={styles.block}>
            <View style={styles.blockHeaderRow}>
              <MaterialCommunityIcons name="compass-outline" size={16} color="#0f172a" />
              <Text style={styles.blockTitle}>Preferred travel modes</Text>
            </View>
            <View style={styles.chipRow}>
              {user.preferredModes.map((m) => (
                <View key={m} style={styles.modeChip}>
                  <MaterialCommunityIcons name={TRAVEL_MODE_ICONS[m]} size={14} color="#0f766e" />
                  <Text style={styles.modeChipText}>{travelModeText(m)}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        <View style={styles.block}>
          <View style={styles.blockHeaderRow}>
            <MaterialCommunityIcons name="map-check-outline" size={16} color="#0f172a" />
            <Text style={styles.blockTitle}>Previous trips ({completedTrips?.length ?? 0})</Text>
          </View>
          {completedTrips && completedTrips.length > 0 ? (
            completedTrips.map((t) => (
              <TouchableOpacity
                key={t.id}
                style={styles.tripRow}
                onPress={() => navigation.navigate("TripDetail", { tripId: t.id })}
              >
                <View style={styles.tripDot} />
                <View style={styles.tripTextWrap}>
                  <Text style={styles.tripTitle} numberOfLines={1}>
                    {t.title}
                  </Text>
                  <Text style={styles.tripMeta} numberOfLines={1}>
                    {t.destination}
                  </Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={18} color="#cbd5e1" />
              </TouchableOpacity>
            ))
          ) : (
            <View style={styles.emptyWrap}>
              <MaterialCommunityIcons name="compass-off-outline" size={32} color="#cbd5e1" />
              <Text style={styles.emptyText}>No completed trips yet — your travel history will show up here.</Text>
            </View>
          )}
        </View>

        <TouchableOpacity style={styles.editButton} onPress={() => navigation.navigate("EditProfile")}>
          <MaterialCommunityIcons name="pencil-outline" size={16} color="#fff" />
          <Text style={styles.editButtonText}>Edit Profile</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.logoutButton} onPress={logout}>
          <MaterialCommunityIcons name="logout" size={15} color="#dc2626" />
          <Text style={styles.logoutText}>Log Out</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc" },
  scrollContent: { paddingBottom: 40 },
  coverWrap: { width: "100%", height: 190 },
  coverWrapWeb: { height: 240 },
  cover: { width: "100%", height: "100%" },
  coverEditButton: {
    position: "absolute",
    right: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(15,23,42,0.55)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  coverEditText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  page: { paddingHorizontal: 20 },
  pageWeb: { width: "100%", maxWidth: 640, alignSelf: "center" },
  headerBlock: { alignItems: "center" },
  avatarWrap: { marginTop: -56 },
  avatar: { width: 104, height: 104, borderRadius: 52, borderWidth: 4, borderColor: "#f8fafc" },
  avatarPlaceholder: { backgroundColor: "#0f766e", alignItems: "center", justifyContent: "center" },
  avatarInitial: { color: "#fff", fontSize: 34, fontWeight: "700" },
  avatarEditBadge: {
    position: "absolute",
    bottom: 2,
    right: 2,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#0f766e",
    borderWidth: 2,
    borderColor: "#f8fafc",
    alignItems: "center",
    justifyContent: "center",
  },
  name: { fontSize: 21, fontWeight: "700", color: "#0f172a", marginTop: 12 },
  metaRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 14, marginTop: 6 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaText: { fontSize: 13, color: "#64748b" },
  bio: { fontSize: 13.5, color: "#334155", textAlign: "center", marginTop: 10, lineHeight: 20, maxWidth: 340 },
  statsRow: { flexDirection: "row", gap: 10, marginTop: 20 },
  statCard: {
    flex: 1,
    alignItems: "center",
    gap: 4,
    backgroundColor: "#fff",
    borderRadius: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  statValue: { fontSize: 18, fontWeight: "700", color: "#0f172a" },
  statLabel: { fontSize: 11, color: "#64748b", fontWeight: "600" },
  block: { marginTop: 22 },
  blockHeaderRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 },
  blockTitle: { fontWeight: "700", fontSize: 14.5, color: "#0f172a" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    backgroundColor: "#fff",
    borderRadius: 999,
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  chipText: { fontSize: 12.5, color: "#334155", fontWeight: "500" },
  modeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#ecfdf5",
    borderRadius: 999,
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#a7f3d0",
  },
  modeChipText: { fontSize: 12.5, color: "#0f766e", fontWeight: "600" },
  tripRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginBottom: 8,
  },
  tripDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: "#0f766e" },
  tripTextWrap: { flex: 1 },
  tripTitle: { fontSize: 14, fontWeight: "600", color: "#0f172a" },
  tripMeta: { fontSize: 12, color: "#64748b", marginTop: 1 },
  emptyWrap: {
    alignItems: "center",
    gap: 8,
    paddingVertical: 26,
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  emptyText: { fontSize: 12.5, color: "#94a3b8", textAlign: "center", paddingHorizontal: 32 },
  editButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#0f766e",
    borderRadius: 14,
    paddingVertical: 15,
    marginTop: 28,
    shadowColor: "#0f766e",
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  editButtonText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    marginTop: 4,
  },
  logoutText: { color: "#dc2626", fontWeight: "600", fontSize: 14 },
});
