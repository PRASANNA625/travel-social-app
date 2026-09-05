import { useState } from "react";
import type { ComponentProps } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AppStackParamList } from "../navigation/types";
import { useMe, useUpdateProfile, useUploadCoverPhoto, useUploadProfilePhoto } from "../api/users";
import { TRAVEL_MODES, type TravelMode } from "../types";
import { TRAVEL_MODE_ICONS, travelModeText } from "../utils/travelModeIcons";
import { Alert } from "../utils/alert";
import { GradientBackground } from "../components/theme/GradientBackground";
import { Card } from "../components/theme/Card";
import { IconInput } from "../components/theme/IconInput";
import { PrimaryButton } from "../components/theme/PrimaryButton";
import { SelectableChip } from "../components/theme/SelectableChip";
import { COLORS, RADIUS } from "../theme/tokens";
import { optimizedImageUrl } from "../utils/optimizedImage";

type Props = NativeStackScreenProps<AppStackParamList, "EditProfile">;
type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

const BIO_MAX_LENGTH = 300;

const INTEREST_OPTIONS: { value: string; icon: IconName }[] = [
  { value: "Adventure", icon: "terrain" },
  { value: "Nature", icon: "leaf" },
  { value: "Beaches", icon: "beach" },
  { value: "Food", icon: "silverware-fork-knife" },
  { value: "Photography", icon: "camera-outline" },
  { value: "Culture", icon: "bank" },
  { value: "Nightlife", icon: "glass-cocktail" },
  { value: "Wildlife", icon: "paw" },
  { value: "Trekking", icon: "hiking" },
];

export function EditProfileScreen({ navigation }: Props) {
  const { data: user } = useMe();
  const updateProfile = useUpdateProfile();
  const uploadPhoto = useUploadProfilePhoto();
  const uploadCover = useUploadCoverPhoto();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { width: windowWidth } = useWindowDimensions();

  const [name, setName] = useState(user?.name ?? "");
  const [age, setAge] = useState(user?.age?.toString() ?? "");
  const [location, setLocation] = useState(user?.location ?? "");
  const [bio, setBio] = useState(user?.bio ?? "");
  const [interests, setInterests] = useState<string[]>(user?.interests ?? []);
  const [preferredModes, setPreferredModes] = useState<TravelMode[]>(user?.preferredModes ?? []);
  const [saved, setSaved] = useState(false);

  const toggleMode = (mode: TravelMode) => {
    setPreferredModes((prev) => (prev.includes(mode) ? prev.filter((m) => m !== mode) : [...prev, mode]));
  };

  const toggleInterest = (value: string) => {
    setInterests((prev) => (prev.includes(value) ? prev.filter((i) => i !== value) : [...prev, value]));
  };

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

  const onSave = () => {
    setSaved(false);
    updateProfile.mutate(
      {
        name: name.trim() || undefined,
        age: age ? Number(age) : null,
        location: location.trim() || null,
        bio: bio.trim() || null,
        interests,
        preferredModes,
      },
      {
        onSuccess: () => {
          setSaved(true);
          setTimeout(() => navigation.goBack(), 900);
        },
        onError: () => Alert.alert("Couldn't save profile", "Please try again"),
      }
    );
  };

  const completionChecks = [
    !!user?.photoUrl,
    !!user?.coverPhotoUrl,
    !!name.trim(),
    !!age,
    !!location.trim(),
    !!bio.trim(),
    interests.length > 0,
    preferredModes.length > 0,
  ];
  const completionPercent = Math.round(
    (completionChecks.filter(Boolean).length / completionChecks.length) * 100
  );

  return (
    <KeyboardAvoidingView style={styles.flexScreen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity style={styles.headerButton} onPress={() => navigation.goBack()}>
          <MaterialCommunityIcons name="arrow-left" size={20} color={COLORS.ink} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          Edit Profile
        </Text>
        <View style={styles.headerButton} />
      </View>

      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={[styles.coverWrap, isWeb && styles.coverWrapWeb]}>
          {user?.coverPhotoUrl ? (
            <Image source={{ uri: optimizedImageUrl(user.coverPhotoUrl, windowWidth) }} style={styles.cover} />
          ) : (
            <GradientBackground style={styles.cover} />
          )}
          <TouchableOpacity style={styles.coverEditButton} onPress={onChangeCover} disabled={uploadCover.isPending}>
            {uploadCover.isPending ? (
              <ActivityIndicator size="small" color={COLORS.white} />
            ) : (
              <>
                <MaterialCommunityIcons name="image-multiple-outline" size={14} color={COLORS.white} />
                <Text style={styles.coverEditText}>Change Cover Photo</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        <View style={[styles.page, isWeb && styles.pageWeb]}>
          <View style={styles.avatarBlock}>
            <TouchableOpacity onPress={onChangePhoto} style={styles.avatarWrap} disabled={uploadPhoto.isPending}>
              {user?.photoUrl ? (
                <Image source={{ uri: optimizedImageUrl(user.photoUrl, 184) }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarPlaceholder]}>
                  <Text style={styles.avatarInitial}>{(user?.name ?? "?").charAt(0).toUpperCase()}</Text>
                </View>
              )}
              <View style={styles.avatarEditBadge}>
                {uploadPhoto.isPending ? (
                  <ActivityIndicator size="small" color={COLORS.white} />
                ) : (
                  <MaterialCommunityIcons name="camera-outline" size={13} color={COLORS.white} />
                )}
              </View>
            </TouchableOpacity>
            <Text style={styles.changePhotoText}>Change Photo</Text>

            <View style={styles.completionBadge}>
              <MaterialCommunityIcons name="progress-check" size={14} color={COLORS.primary} />
              <Text style={styles.completionText}>Profile {completionPercent}% complete</Text>
            </View>
            <View style={styles.completionTrack}>
              <View style={[styles.completionFill, { width: `${completionPercent}%` }]} />
            </View>
          </View>

          <Card style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <MaterialCommunityIcons name="account-outline" size={18} color={COLORS.primary} />
              <Text style={styles.cardTitle}>Basic Information</Text>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Name</Text>
              <IconInput icon="account-outline" placeholder="Your name" value={name} onChangeText={setName} />
            </View>

            <View style={styles.fieldRow}>
              <View style={[styles.fieldGroup, styles.fieldHalf]}>
                <Text style={styles.fieldLabel}>Age</Text>
                <IconInput
                  icon="cake-variant-outline"
                  placeholder="e.g., 28"
                  keyboardType="numeric"
                  value={age}
                  onChangeText={setAge}
                />
              </View>
              <View style={[styles.fieldGroup, styles.fieldHalf]}>
                <Text style={styles.fieldLabel}>Home / Current City</Text>
                <IconInput
                  icon="map-marker-outline"
                  placeholder="e.g., Bengaluru"
                  value={location}
                  onChangeText={setLocation}
                />
              </View>
            </View>
          </Card>

          <Card style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <MaterialCommunityIcons name="note-text-outline" size={18} color={COLORS.primary} />
              <Text style={styles.cardTitle}>About You</Text>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Bio</Text>
              <IconInput
                icon="note-text-outline"
                placeholder="Tell other travelers a bit about yourself..."
                multiline
                maxLength={BIO_MAX_LENGTH}
                value={bio}
                onChangeText={setBio}
              />
              <Text style={styles.charCounter}>
                {bio.length}/{BIO_MAX_LENGTH}
              </Text>
            </View>
          </Card>

          <Card style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <MaterialCommunityIcons name="compass-outline" size={18} color={COLORS.primary} />
              <Text style={styles.cardTitle}>Travel Preferences</Text>
            </View>

            <Text style={styles.fieldLabel}>Preferred travel modes</Text>
            <View style={styles.chipRow}>
              {TRAVEL_MODES.map((mode) => (
                <SelectableChip
                  key={mode}
                  icon={TRAVEL_MODE_ICONS[mode]}
                  label={travelModeText(mode)}
                  active={preferredModes.includes(mode)}
                  onPress={() => toggleMode(mode)}
                />
              ))}
            </View>

            <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>Travel interests</Text>
            <View style={styles.chipRow}>
              {INTEREST_OPTIONS.map((option) => (
                <SelectableChip
                  key={option.value}
                  icon={option.icon}
                  label={option.value}
                  active={interests.includes(option.value)}
                  onPress={() => toggleInterest(option.value)}
                />
              ))}
            </View>
          </Card>
        </View>
      </ScrollView>

      <View style={[styles.stickyBar, { paddingBottom: insets.bottom + 12 }]}>
        {saved && (
          <View style={styles.successBanner}>
            <MaterialCommunityIcons name="check-circle-outline" size={16} color="#166534" />
            <Text style={styles.successText}>Profile updated successfully</Text>
          </View>
        )}
        <PrimaryButton
          label="Save Changes"
          icon="check"
          onPress={onSave}
          disabled={updateProfile.isPending}
          loading={updateProfile.isPending}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flexScreen: { flex: 1, backgroundColor: COLORS.fieldBg },
  container: { flex: 1 },
  scrollContent: { paddingBottom: 24 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingBottom: 10,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.fieldBg,
  },
  headerTitle: { flex: 1, textAlign: "center", fontSize: 16, fontWeight: "700", color: COLORS.ink },
  coverWrap: { width: "100%", height: 150 },
  coverWrapWeb: { height: 200 },
  cover: { width: "100%", height: "100%" },
  coverEditButton: {
    position: "absolute",
    right: 14,
    bottom: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(15,23,42,0.55)",
    borderRadius: RADIUS.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  coverEditText: { color: COLORS.white, fontSize: 12, fontWeight: "700" },
  page: { paddingHorizontal: 20, gap: 16 },
  pageWeb: { width: "100%", maxWidth: 640, alignSelf: "center" },
  avatarBlock: { alignItems: "center" },
  avatarWrap: { marginTop: -48 },
  avatar: { width: 92, height: 92, borderRadius: 46, borderWidth: 4, borderColor: COLORS.fieldBg },
  avatarPlaceholder: { backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center" },
  avatarInitial: { color: COLORS.white, fontSize: 30, fontWeight: "700" },
  avatarEditBadge: {
    position: "absolute",
    bottom: 2,
    right: 2,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: COLORS.primary,
    borderWidth: 2,
    borderColor: COLORS.fieldBg,
    alignItems: "center",
    justifyContent: "center",
  },
  changePhotoText: { color: COLORS.primary, fontSize: 12.5, fontWeight: "700", marginTop: 6 },
  completionBadge: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 12 },
  completionText: { fontSize: 12.5, color: "#334155", fontWeight: "600" },
  completionTrack: {
    width: "100%",
    maxWidth: 260,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.border,
    marginTop: 8,
    overflow: "hidden",
  },
  completionFill: { height: "100%", backgroundColor: COLORS.primary, borderRadius: 3 },
  card: { padding: 16, gap: 12 },
  cardHeaderRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 2 },
  cardTitle: { fontSize: 15, fontWeight: "700", color: COLORS.ink },
  fieldRow: { flexDirection: "row", gap: 12 },
  fieldHalf: { flex: 1 },
  fieldGroup: { gap: 6 },
  fieldLabel: { fontSize: 12.5, fontWeight: "700", color: "#334155" },
  fieldLabelSpaced: { marginTop: 4 },
  charCounter: { alignSelf: "flex-end", fontSize: 11, color: COLORS.mutedLight },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  stickyBar: {
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 10,
    backgroundColor: COLORS.white,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
  },
  successBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#dcfce7",
    borderRadius: 10,
    paddingVertical: 8,
  },
  successText: { color: "#166534", fontSize: 12.5, fontWeight: "700" },
});
