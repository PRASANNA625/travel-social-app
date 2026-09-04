import { useEffect, useState } from "react";
import {
  ActivityIndicator,
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
import { useCreateTrip, useTrip, useUpdateTrip, useUploadTripImages } from "../api/trips";
import { TRAVEL_MODES, TRAVEL_MODE_LABELS, type JoinType, type TravelMode } from "../types";
import { TripDateFields } from "../components/TripDateFields";
import { Alert } from "../utils/alert";

type Props = NativeStackScreenProps<AppStackParamList, "CreateTrip">;

const JOIN_TYPES: { value: JoinType; label: string }[] = [
  { value: "OPEN", label: "Open to everyone" },
  { value: "APPROVAL", label: "Requires approval" },
  { value: "INVITE_ONLY", label: "Invite-only" },
];

function splitModeLabel(label: string): { icon: string; text: string } {
  const [icon, ...rest] = label.split(" ");
  return { icon, text: rest.join(" ") };
}

function FieldLabel({ text, required }: { text: string; required?: boolean }) {
  return (
    <Text style={styles.label}>
      {text}
      {required && <Text style={styles.required}> *</Text>}
    </Text>
  );
}

export function CreateTripScreen({ navigation, route }: Props) {
  const tripId = route.params?.tripId;
  const isEditMode = !!tripId;
  const { data: existingTrip, isLoading: isLoadingTrip } = useTrip(tripId);
  const [prefilled, setPrefilled] = useState(false);

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
  const [coverPhoto, setCoverPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [images, setImages] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [submitted, setSubmitted] = useState(false);

  const createTrip = useCreateTrip();
  const updateTrip = useUpdateTrip();
  const uploadImages = useUploadTripImages();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!isEditMode || !existingTrip || prefilled) return;
    setTitle(existingTrip.title);
    setDestination(existingTrip.destination);
    setStartLocation(existingTrip.startLocation);
    setStartDate(new Date(existingTrip.startDate));
    setEndDate(new Date(existingTrip.endDate));
    setTravelMode(existingTrip.travelMode);
    setBudget(existingTrip.budget != null ? String(existingTrip.budget) : "");
    setSeats(String(existingTrip.seats));
    setDescription(existingTrip.description);
    setPlacesToVisit(existingTrip.placesToVisit.join(", "));
    setNotes(existingTrip.notes ?? "");
    setJoinType(existingTrip.joinType);
    setPrefilled(true);
  }, [isEditMode, existingTrip, prefilled]);

  const pickCoverPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });
    if (!result.canceled) {
      setCoverPhoto(result.assets[0]);
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
      setImages((prev) => [...prev, ...result.assets]);
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
      if (isEditMode && tripId) {
        await updateTrip.mutateAsync({
          tripId,
          input: {
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
            notes: notes.trim() || undefined,
            joinType,
          },
        });
        navigation.navigate("TripDetail", { tripId });
        return;
      }

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
      Alert.alert(
        isEditMode ? "Couldn't save changes" : "Couldn't create trip",
        err?.response?.data?.error ?? "Please try again"
      );
    }
  };

  const isSubmitting = createTrip.isPending || uploadImages.isPending || updateTrip.isPending;

  if (isEditMode && (isLoadingTrip || !prefilled)) {
    return <ActivityIndicator style={{ marginTop: 40 }} size="large" />;
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 16, paddingBottom: 16 + insets.bottom, gap: 12 }}
    >
      <Text style={styles.sectionTitle}>{isEditMode ? "Edit Trip" : "Trip Information"}</Text>
      <Text style={styles.sectionSubtitle}>
        {isEditMode ? "Update your trip details below" : "Share your travel plan and find like-minded companions"}
      </Text>

      <FieldLabel text="Trip title" required />
      <TextInput
        style={[styles.input, submitted && !title.trim() && styles.inputError]}
        placeholder="e.g., Spiti Valley Road Trip"
        placeholderTextColor="#94a3b8"
        maxLength={60}
        value={title}
        onChangeText={setTitle}
      />
      <Text style={styles.counter}>{title.length}/60</Text>

      <View style={styles.row}>
        <View style={styles.flex1}>
          <FieldLabel text="Starting location" required />
          <TextInput
            style={[styles.input, submitted && !startLocation.trim() && styles.inputError]}
            placeholder="e.g., Chennai, India"
            placeholderTextColor="#94a3b8"
            value={startLocation}
            onChangeText={setStartLocation}
          />
        </View>
        <View style={styles.flex1}>
          <FieldLabel text="Destination" required />
          <TextInput
            style={[styles.input, submitted && !destination.trim() && styles.inputError]}
            placeholder="e.g., Ladakh, India"
            placeholderTextColor="#94a3b8"
            value={destination}
            onChangeText={setDestination}
          />
        </View>
      </View>

      <View style={styles.row}>
        <View style={styles.flex1}>
          <FieldLabel text="Start date" required />
        </View>
        <View style={styles.flex1}>
          <FieldLabel text="End date" required />
        </View>
      </View>
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

      <FieldLabel text="Travel mode" required />
      <Text style={styles.helperText}>Select how you are planning to travel</Text>
      <View style={[styles.modeGrid, submitted && !travelMode && styles.selectorError]}>
        {TRAVEL_MODES.map((mode) => {
          const { icon, text } = splitModeLabel(TRAVEL_MODE_LABELS[mode]);
          const active = travelMode === mode;
          return (
            <TouchableOpacity
              key={mode}
              style={[styles.modeCard, active && styles.modeCardActive]}
              onPress={() => setTravelMode(mode)}
            >
              <Text style={styles.modeIcon}>{icon}</Text>
              <Text style={[styles.modeText, active && styles.modeTextActive]} numberOfLines={2}>
                {text}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.row}>
        <View style={styles.flex1}>
          <FieldLabel text="Budget (₹, optional)" />
          <TextInput
            style={styles.input}
            placeholder="e.g., 10000"
            placeholderTextColor="#94a3b8"
            keyboardType="numeric"
            value={budget}
            onChangeText={setBudget}
          />
        </View>
        <View style={styles.flex1}>
          <FieldLabel text="Seats available" required />
          <TextInput
            style={[styles.input, submitted && (!seats.trim() || Number(seats) < 1) && styles.inputError]}
            placeholder="e.g., 4"
            placeholderTextColor="#94a3b8"
            keyboardType="numeric"
            value={seats}
            onChangeText={setSeats}
          />
        </View>
      </View>

      <FieldLabel text="Describe the trip" required />
      <TextInput
        style={[styles.input, styles.multiline, submitted && !description.trim() && styles.inputError]}
        placeholder="Share a short description about your trip, what you plan to do, and what kind of companions you're looking for..."
        placeholderTextColor="#94a3b8"
        multiline
        maxLength={500}
        value={description}
        onChangeText={setDescription}
      />
      <Text style={styles.counter}>{description.length}/500</Text>

      <FieldLabel text="Places to visit (comma-separated)" />
      <TextInput
        style={styles.input}
        placeholder="e.g., Pangong Lake, Nubra Valley, Khardung La"
        placeholderTextColor="#94a3b8"
        value={placesToVisit}
        onChangeText={setPlacesToVisit}
      />

      <FieldLabel text="Special requirements or notes (optional)" />
      <TextInput
        style={[styles.input, styles.multiline]}
        placeholder="e.g., fitness level, equipment needed, language preference, etc."
        placeholderTextColor="#94a3b8"
        multiline
        value={notes}
        onChangeText={setNotes}
      />

      <FieldLabel text="Who can join?" required />
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

      {!isEditMode && (
        <>
          <Text style={styles.label}>Cover photo</Text>
          {coverPhoto ? (
            <TouchableOpacity onPress={pickCoverPhoto}>
              <Image source={{ uri: coverPhoto.uri }} style={styles.coverPreview} />
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
            {images.map((asset) => (
              <Image key={asset.uri} source={{ uri: asset.uri }} style={styles.thumb} />
            ))}
            <TouchableOpacity style={styles.addImage} onPress={pickImages}>
              <Text style={{ fontSize: 24 }}>+</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      <TouchableOpacity onPress={onSubmit} disabled={isSubmitting} activeOpacity={0.85}>
        <LinearGradient colors={["#2563eb", "#0f766e"]} style={styles.submitButton}>
          {isSubmitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitText}>{isEditMode ? "Save Changes" : "Publish Trip"}</Text>
          )}
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
  required: { color: "#dc2626" },
  counter: { alignSelf: "flex-end", fontSize: 11, color: "#94a3b8", marginTop: -6 },
  helperText: { fontSize: 12, color: "#64748b", marginTop: -2 },
  sectionTitle: { fontSize: 20, fontWeight: "700", color: "#0f172a" },
  sectionSubtitle: { fontSize: 13, color: "#64748b", marginBottom: 4 },
  modeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  modeCard: {
    flexBasis: "31%",
    flexGrow: 1,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: "center",
    gap: 4,
    backgroundColor: "#f8fafc",
  },
  modeCardActive: { borderColor: "#0f766e", backgroundColor: "#ecfdf5" },
  modeIcon: { fontSize: 20 },
  modeText: { fontSize: 11, color: "#334155", textAlign: "center" },
  modeTextActive: { color: "#0f766e", fontWeight: "700" },
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
