import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as ImagePicker from "expo-image-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AppStackParamList } from "../navigation/types";
import { useCreateTrip, useUploadTripImages } from "../api/trips";
import { TRAVEL_MODES, TRAVEL_MODE_LABELS, type JoinType, type TravelMode } from "../types";

type Props = NativeStackScreenProps<AppStackParamList, "CreateTrip">;

const JOIN_TYPES: { value: JoinType; label: string }[] = [
  { value: "OPEN", label: "Open to everyone" },
  { value: "APPROVAL", label: "Requires approval" },
  { value: "INVITE_ONLY", label: "Invite-only" },
];

export function CreateTripScreen({ navigation }: Props) {
  const [title, setTitle] = useState("");
  const [destination, setDestination] = useState("");
  const [startLocation, setStartLocation] = useState("");
  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState(new Date(Date.now() + 86400000));
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [travelMode, setTravelMode] = useState<TravelMode>("TREK");
  const [budget, setBudget] = useState("");
  const [seats, setSeats] = useState("4");
  const [description, setDescription] = useState("");
  const [placesToVisit, setPlacesToVisit] = useState("");
  const [notes, setNotes] = useState("");
  const [joinType, setJoinType] = useState<JoinType>("APPROVAL");
  const [images, setImages] = useState<string[]>([]);

  const createTrip = useCreateTrip();
  const uploadImages = useUploadTripImages();
  const insets = useSafeAreaInsets();

  const pickImages = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: 8,
      quality: 0.7,
    });
    if (!result.canceled) {
      setImages((prev) => [...prev, ...result.assets.map((a) => a.uri)]);
    }
  };

  const onSubmit = async () => {
    if (!title.trim() || !destination.trim() || !startLocation.trim() || !description.trim()) {
      Alert.alert("Missing details", "Title, destination, start location, and description are required.");
      return;
    }
    const seatsNum = Number(seats);
    if (!seatsNum || seatsNum < 1) {
      Alert.alert("Invalid seats", "Number of seats must be at least 1.");
      return;
    }

    try {
      let uploadedUrls: string[] = [];
      if (images.length > 0) {
        uploadedUrls = await uploadImages.mutateAsync(images);
      }

      const trip = await createTrip.mutateAsync({
        title: title.trim(),
        destination: destination.trim(),
        startLocation: startLocation.trim(),
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        travelMode,
        budget: budget ? Number(budget) : undefined,
        seats: seatsNum,
        description: description.trim(),
        placesToVisit: placesToVisit
          .split(",")
          .map((p) => p.trim())
          .filter(Boolean),
        images: uploadedUrls,
        notes: notes.trim() || undefined,
        joinType,
      });

      navigation.replace("TripDetail", { tripId: trip.id });
    } catch (err: any) {
      Alert.alert("Couldn't create trip", err?.response?.data?.error ?? "Please try again");
    }
  };

  const isSubmitting = createTrip.isPending || uploadImages.isPending;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 16, paddingBottom: 16 + insets.bottom, gap: 12 }}
    >
      <TextInput style={styles.input} placeholder="Trip title" value={title} onChangeText={setTitle} />
      <TextInput style={styles.input} placeholder="Starting location" value={startLocation} onChangeText={setStartLocation} />
      <TextInput style={styles.input} placeholder="Destination" value={destination} onChangeText={setDestination} />

      <View style={styles.row}>
        <TouchableOpacity style={[styles.input, styles.flex1]} onPress={() => setShowStartPicker(true)}>
          <Text>Start: {startDate.toDateString()}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.input, styles.flex1]} onPress={() => setShowEndPicker(true)}>
          <Text>End: {endDate.toDateString()}</Text>
        </TouchableOpacity>
      </View>
      {showStartPicker && (
        <DateTimePicker
          value={startDate}
          mode="date"
          onChange={(_, date) => {
            setShowStartPicker(false);
            if (date) setStartDate(date);
          }}
        />
      )}
      {showEndPicker && (
        <DateTimePicker
          value={endDate}
          mode="date"
          onChange={(_, date) => {
            setShowEndPicker(false);
            if (date) setEndDate(date);
          }}
        />
      )}

      <Text style={styles.label}>Travel mode</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {TRAVEL_MODES.map((mode) => (
          <TouchableOpacity
            key={mode}
            style={[styles.chip, travelMode === mode && styles.chipActive]}
            onPress={() => setTravelMode(mode)}
          >
            <Text style={[styles.chipText, travelMode === mode && styles.chipTextActive]}>
              {TRAVEL_MODE_LABELS[mode]}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={styles.row}>
        <TextInput
          style={[styles.input, styles.flex1]}
          placeholder="Budget (₹, optional)"
          keyboardType="numeric"
          value={budget}
          onChangeText={setBudget}
        />
        <TextInput
          style={[styles.input, styles.flex1]}
          placeholder="Seats available"
          keyboardType="numeric"
          value={seats}
          onChangeText={setSeats}
        />
      </View>

      <TextInput
        style={[styles.input, styles.multiline]}
        placeholder="Describe the trip..."
        multiline
        value={description}
        onChangeText={setDescription}
      />
      <TextInput
        style={styles.input}
        placeholder="Places to visit (comma-separated)"
        value={placesToVisit}
        onChangeText={setPlacesToVisit}
      />
      <TextInput
        style={[styles.input, styles.multiline]}
        placeholder="Special requirements or notes (optional)"
        multiline
        value={notes}
        onChangeText={setNotes}
      />

      <Text style={styles.label}>Who can join?</Text>
      {JOIN_TYPES.map((jt) => (
        <TouchableOpacity key={jt.value} style={styles.radioRow} onPress={() => setJoinType(jt.value)}>
          <View style={[styles.radioOuter, joinType === jt.value && styles.radioOuterActive]}>
            {joinType === jt.value && <View style={styles.radioInner} />}
          </View>
          <Text>{jt.label}</Text>
        </TouchableOpacity>
      ))}

      <Text style={styles.label}>Photos</Text>
      <View style={styles.row}>
        {images.map((uri) => (
          <Image key={uri} source={{ uri }} style={styles.thumb} />
        ))}
        <TouchableOpacity style={styles.addImage} onPress={pickImages}>
          <Text style={{ fontSize: 24 }}>+</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.submitButton} onPress={onSubmit} disabled={isSubmitting}>
        {isSubmitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Publish Trip</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  input: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    justifyContent: "center",
  },
  multiline: { minHeight: 80, textAlignVertical: "top" },
  row: { flexDirection: "row", gap: 10 },
  flex1: { flex: 1 },
  label: { fontWeight: "700", fontSize: 14, marginTop: 4 },
  chip: {
    backgroundColor: "#f1f5f9",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
  },
  chipActive: { backgroundColor: "#0f766e" },
  chipText: { fontSize: 12, color: "#334155" },
  chipTextActive: { color: "#fff", fontWeight: "600" },
  radioRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6 },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#cbd5e1",
    alignItems: "center",
    justifyContent: "center",
  },
  radioOuterActive: { borderColor: "#0f766e" },
  radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#0f766e" },
  thumb: { width: 60, height: 60, borderRadius: 8 },
  addImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  submitButton: {
    backgroundColor: "#0f766e",
    borderRadius: 10,
    padding: 16,
    alignItems: "center",
    marginTop: 16,
    marginBottom: 40,
  },
  submitText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
