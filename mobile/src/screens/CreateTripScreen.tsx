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
import * as ImagePicker from "expo-image-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AppStackParamList } from "../navigation/types";
import { useCreateTrip, useUploadTripImages } from "../api/trips";
import { TRAVEL_MODES, TRAVEL_MODE_LABELS, type JoinType, type TravelMode } from "../types";
import { TripDateFields } from "../components/TripDateFields";

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
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [travelMode, setTravelMode] = useState<TravelMode | undefined>(undefined);
  const [budget, setBudget] = useState("");
  const [seats, setSeats] = useState("");
  const [description, setDescription] = useState("");
  const [placesToVisit, setPlacesToVisit] = useState("");
  const [notes, setNotes] = useState("");
  const [joinType, setJoinType] = useState<JoinType | undefined>(undefined);
  const [coverPhoto, setCoverPhoto] = useState<string | null>(null);
  const [images, setImages] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);

  const createTrip = useCreateTrip();
  const uploadImages = useUploadTripImages();
  const insets = useSafeAreaInsets();

  const pickCoverPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });
    if (!result.canceled) {
      setCoverPhoto(result.assets[0].uri);
    }
  };

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
    setSubmitted(true);

    if (
      !title.trim() ||
      !destination.trim() ||
      !startLocation.trim() ||
      !description.trim() ||
      !travelMode ||
      !joinType ||
      !endDate ||
      !seats.trim()
    ) {
      Alert.alert("Missing details", "Please fill in all required fields, highlighted in red.");
      return;
    }
    const seatsNum = Number(seats);
    if (!seatsNum || seatsNum < 1) {
      Alert.alert("Invalid seats", "Number of seats must be at least 1.");
      return;
    }

    try {
      const allImages = coverPhoto ? [coverPhoto, ...images] : images;
      let uploadedUrls: string[] = [];
      if (allImages.length > 0) {
        uploadedUrls = await uploadImages.mutateAsync(allImages);
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
      <TextInput
        style={[styles.input, submitted && !title.trim() && styles.inputError]}
        placeholder="Trip title"
        value={title}
        onChangeText={setTitle}
      />
      <TextInput
        style={[styles.input, submitted && !startLocation.trim() && styles.inputError]}
        placeholder="Starting location"
        value={startLocation}
        onChangeText={setStartLocation}
      />
      <TextInput
        style={[styles.input, submitted && !destination.trim() && styles.inputError]}
        placeholder="Destination"
        value={destination}
        onChangeText={setDestination}
      />

      <TripDateFields
        startDate={startDate}
        endDate={endDate}
        onChangeStart={setStartDate}
        onChangeEnd={setEndDate}
        endError={submitted && !endDate}
        inputStyle={styles.input}
        errorStyle={styles.inputError}
        placeholderStyle={styles.placeholderText}
      />

      <Text style={styles.label}>Travel mode</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[submitted && !travelMode && styles.selectorError]}
      >
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
          style={[
            styles.input,
            styles.flex1,
            submitted && (!seats.trim() || Number(seats) < 1) && styles.inputError,
          ]}
          placeholder="Seats available"
          keyboardType="numeric"
          value={seats}
          onChangeText={setSeats}
        />
      </View>

      <TextInput
        style={[styles.input, styles.multiline, submitted && !description.trim() && styles.inputError]}
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
      <View style={[styles.radioGroup, submitted && !joinType && styles.selectorError]}>
        {JOIN_TYPES.map((jt) => (
        <TouchableOpacity key={jt.value} style={styles.radioRow} onPress={() => setJoinType(jt.value)}>
          <View style={[styles.radioOuter, joinType === jt.value && styles.radioOuterActive]}>
            {joinType === jt.value && <View style={styles.radioInner} />}
          </View>
          <Text>{jt.label}</Text>
        </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Cover photo</Text>
      {coverPhoto ? (
        <TouchableOpacity onPress={pickCoverPhoto}>
          <Image source={{ uri: coverPhoto }} style={styles.coverPreview} />
          <View style={styles.coverChangeBadge}>
            <Text style={styles.coverChangeText}>Change</Text>
          </View>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity style={styles.coverPicker} onPress={pickCoverPhoto}>
          <Text style={{ fontSize: 28 }}>🖼️</Text>
          <Text style={styles.coverPickerText}>Add a cover photo</Text>
        </TouchableOpacity>
      )}

      <Text style={styles.label}>Additional photos</Text>
      <View style={styles.row}>
        {images.map((uri) => (
          <Image key={uri} source={{ uri }} style={styles.thumb} />
        ))}
        <TouchableOpacity style={styles.addImage} onPress={pickImages}>
          <Text style={{ fontSize: 24 }}>+</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity onPress={onSubmit} disabled={isSubmitting} activeOpacity={0.85}>
        <LinearGradient colors={["#2563eb", "#0f766e"]} style={styles.submitButton}>
          {isSubmitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Publish Trip</Text>}
        </LinearGradient>
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
  inputError: { borderColor: "#dc2626" },
  placeholderText: { color: "#94a3b8" },
  selectorError: { borderWidth: 1, borderColor: "#dc2626", borderRadius: 10, padding: 6 },
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
  radioGroup: { gap: 2 },
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
  coverPicker: {
    height: 150,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f8fafc",
    gap: 6,
  },
  coverPickerText: { color: "#64748b", fontSize: 13, fontWeight: "600" },
  coverPreview: { width: "100%", height: 150, borderRadius: 14 },
  coverChangeBadge: {
    position: "absolute",
    right: 10,
    bottom: 10,
    backgroundColor: "rgba(15,23,42,0.75)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  coverChangeText: { color: "#fff", fontSize: 11, fontWeight: "700" },
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
