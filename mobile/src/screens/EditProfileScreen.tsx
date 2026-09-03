import { useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AppStackParamList } from "../navigation/types";
import { useMe, useUpdateProfile } from "../api/users";
import { TRAVEL_MODES, TRAVEL_MODE_LABELS, type TravelMode } from "../types";

type Props = NativeStackScreenProps<AppStackParamList, "EditProfile">;

export function EditProfileScreen({ navigation }: Props) {
  const { data: user } = useMe();
  const updateProfile = useUpdateProfile();

  const [name, setName] = useState(user?.name ?? "");
  const [age, setAge] = useState(user?.age?.toString() ?? "");
  const [location, setLocation] = useState(user?.location ?? "");
  const [bio, setBio] = useState(user?.bio ?? "");
  const [interests, setInterests] = useState(user?.interests.join(", ") ?? "");
  const [preferredModes, setPreferredModes] = useState<TravelMode[]>(user?.preferredModes ?? []);

  const toggleMode = (mode: TravelMode) => {
    setPreferredModes((prev) => (prev.includes(mode) ? prev.filter((m) => m !== mode) : [...prev, mode]));
  };

  const onSave = () => {
    updateProfile.mutate(
      {
        name: name.trim() || undefined,
        age: age ? Number(age) : null,
        location: location.trim() || null,
        bio: bio.trim() || null,
        interests: interests
          .split(",")
          .map((i) => i.trim())
          .filter(Boolean),
        preferredModes,
      },
      {
        onSuccess: () => navigation.goBack(),
        onError: () => Alert.alert("Couldn't save profile", "Please try again"),
      }
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, gap: 12 }}>
      <TextInput style={styles.input} placeholder="Name" value={name} onChangeText={setName} />
      <TextInput style={styles.input} placeholder="Age" keyboardType="numeric" value={age} onChangeText={setAge} />
      <TextInput style={styles.input} placeholder="Location" value={location} onChangeText={setLocation} />
      <TextInput
        style={[styles.input, styles.multiline]}
        placeholder="About / Bio"
        multiline
        value={bio}
        onChangeText={setBio}
      />
      <TextInput
        style={styles.input}
        placeholder="Travel interests (comma-separated)"
        value={interests}
        onChangeText={setInterests}
      />

      <Text style={styles.label}>Preferred travel modes</Text>
      <View style={styles.chipRow}>
        {TRAVEL_MODES.map((mode) => (
          <TouchableOpacity
            key={mode}
            style={[styles.chip, preferredModes.includes(mode) && styles.chipActive]}
            onPress={() => toggleMode(mode)}
          >
            <Text style={[styles.chipText, preferredModes.includes(mode) && styles.chipTextActive]}>
              {TRAVEL_MODE_LABELS[mode]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity style={styles.saveButton} onPress={onSave} disabled={updateProfile.isPending}>
        {updateProfile.isPending ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Save Changes</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  input: { borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 10, padding: 12, fontSize: 15 },
  multiline: { minHeight: 80, textAlignVertical: "top" },
  label: { fontWeight: "700", fontSize: 14 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { backgroundColor: "#f1f5f9", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  chipActive: { backgroundColor: "#0f766e" },
  chipText: { fontSize: 12, color: "#334155" },
  chipTextActive: { color: "#fff", fontWeight: "600" },
  saveButton: { backgroundColor: "#0f766e", borderRadius: 10, padding: 16, alignItems: "center", marginTop: 8, marginBottom: 40 },
  saveText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
