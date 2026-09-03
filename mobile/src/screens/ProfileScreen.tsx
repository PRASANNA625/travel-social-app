import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import type { CompositeScreenProps } from "@react-navigation/native";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AppStackParamList, AppTabParamList } from "../navigation/types";
import { useAuthStore } from "../store/authStore";
import { useMe, useUploadProfilePhoto, useCompletedTrips } from "../api/users";
import { TRAVEL_MODE_LABELS } from "../types";

type Props = CompositeScreenProps<
  BottomTabScreenProps<AppTabParamList, "Profile">,
  NativeStackScreenProps<AppStackParamList>
>;

export function ProfileScreen({ navigation }: Props) {
  const { data: user, isLoading } = useMe();
  const { data: completedTrips } = useCompletedTrips(user?.id);
  const uploadPhoto = useUploadProfilePhoto();
  const logout = useAuthStore((s) => s.logout);

  const onChangePhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7 });
    if (result.canceled) return;
    uploadPhoto.mutate(result.assets[0].uri, {
      onError: () => Alert.alert("Couldn't upload photo", "Please try again"),
    });
  };

  if (isLoading || !user) return <ActivityIndicator style={{ marginTop: 40 }} size="large" />;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 20 }}>
      <TouchableOpacity onPress={onChangePhoto} style={styles.avatarWrap}>
        {user.photoUrl ? (
          <Image source={{ uri: user.photoUrl }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder]}>
            <Text style={{ fontSize: 32 }}>{user.name[0]}</Text>
          </View>
        )}
        <Text style={styles.changePhoto}>Change photo</Text>
      </TouchableOpacity>

      <Text style={styles.name}>{user.name}</Text>
      {user.location && <Text style={styles.meta}>📍 {user.location}</Text>}
      {user.age != null && <Text style={styles.meta}>🎂 {user.age}</Text>}
      {user.bio && <Text style={styles.bio}>{user.bio}</Text>}

      {user.interests.length > 0 && (
        <View style={styles.block}>
          <Text style={styles.blockTitle}>Travel interests</Text>
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
          <Text style={styles.blockTitle}>Preferred travel modes</Text>
          <View style={styles.chipRow}>
            {user.preferredModes.map((m) => (
              <View key={m} style={styles.chip}>
                <Text style={styles.chipText}>{TRAVEL_MODE_LABELS[m]}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      <View style={styles.block}>
        <Text style={styles.blockTitle}>Previous trips ({completedTrips?.length ?? 0})</Text>
        {completedTrips?.map((t) => (
          <Text key={t.id} style={styles.meta}>• {t.title} — {t.destination}</Text>
        ))}
      </View>

      <TouchableOpacity style={styles.editButton} onPress={() => navigation.navigate("EditProfile")}>
        <Text style={styles.editButtonText}>Edit Profile</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.logoutButton} onPress={logout}>
        <Text style={styles.logoutText}>Log Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  avatarWrap: { alignItems: "center", marginBottom: 16 },
  avatar: { width: 96, height: 96, borderRadius: 48 },
  avatarPlaceholder: { backgroundColor: "#f1f5f9", alignItems: "center", justifyContent: "center" },
  changePhoto: { color: "#0f766e", fontSize: 12, marginTop: 6, fontWeight: "600" },
  name: { fontSize: 22, fontWeight: "700", textAlign: "center" },
  meta: { fontSize: 13, color: "#64748b", textAlign: "center", marginTop: 4 },
  bio: { fontSize: 14, color: "#334155", textAlign: "center", marginTop: 10 },
  block: { marginTop: 20 },
  blockTitle: { fontWeight: "700", fontSize: 14, marginBottom: 8 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { backgroundColor: "#f1f5f9", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  chipText: { fontSize: 12, color: "#334155" },
  editButton: { backgroundColor: "#0f766e", borderRadius: 10, padding: 14, alignItems: "center", marginTop: 28 },
  editButtonText: { color: "#fff", fontWeight: "700" },
  logoutButton: { padding: 14, alignItems: "center", marginTop: 8 },
  logoutText: { color: "#dc2626", fontWeight: "600" },
});
