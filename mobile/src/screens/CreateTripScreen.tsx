import { useEffect, useState, type ComponentProps } from "react";
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AppStackParamList } from "../navigation/types";
import { useCreateTrip, useTrip, useUpdateTrip, useUploadTripImages } from "../api/trips";
import { TRAVEL_MODES, type JoinType, type TravelMode } from "../types";
import { TRAVEL_MODE_ICONS, travelModeText } from "../utils/travelModeIcons";
import { TripDateFields } from "../components/TripDateFields";
import { LocationPickerModal, type LocationValue } from "../components/LocationPickerModal";
import { GradientBackground } from "../components/theme/GradientBackground";
import { Card } from "../components/theme/Card";
import { IconInput } from "../components/theme/IconInput";
import { PrimaryButton } from "../components/theme/PrimaryButton";
import { SelectableChip } from "../components/theme/SelectableChip";
import { COLORS, RADIUS, TYPE } from "../theme/tokens";
import { Alert } from "../utils/alert";
import { isAfterDate, isBeforeToday } from "../utils/date";

type Props = NativeStackScreenProps<AppStackParamList, "CreateTrip">;
type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

const JOIN_TYPES: { value: JoinType; label: string; icon: IconName }[] = [
  { value: "OPEN", label: "Open to everyone", icon: "earth" },
  { value: "APPROVAL", label: "Requires approval", icon: "shield-check-outline" },
];

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
  const [startLocationCoords, setStartLocationCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [destinationCoords, setDestinationCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [activePicker, setActivePicker] = useState<"start" | "destination" | null>(null);
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
    setStartLocationCoords(
      existingTrip.startLat != null && existingTrip.startLng != null
        ? { lat: existingTrip.startLat, lng: existingTrip.startLng }
        : null
    );
    setDestinationCoords(
      existingTrip.destLat != null && existingTrip.destLng != null
        ? { lat: existingTrip.destLat, lng: existingTrip.destLng }
        : null
    );
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

  const handleStartDateChange = (date: Date) => {
    setStartDate(date);
    if (endDate && isAfterDate(date, endDate)) {
      setEndDate(undefined);
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

    const datesChanged =
      !isEditMode ||
      !existingTrip ||
      startDate.getTime() !== new Date(existingTrip.startDate).getTime() ||
      (endDate?.getTime() ?? null) !== new Date(existingTrip.endDate).getTime();

    if (datesChanged) {
      if (endDate && isBeforeToday(endDate)) {
        Alert.alert("Invalid end date", "End date must be today or a future date.");
        return;
      }
      if (endDate && isAfterDate(startDate, endDate)) {
        Alert.alert("Invalid dates", "Start date cannot be after the end date.");
        return;
      }
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
            startLat: startLocationCoords?.lat ?? null,
            startLng: startLocationCoords?.lng ?? null,
            destLat: destinationCoords?.lat ?? null,
            destLng: destinationCoords?.lng ?? null,
            ...(datesChanged
              ? { startDate: startDate.toISOString(), endDate: endDate.toISOString() }
              : {}),
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
        startLat: startLocationCoords?.lat ?? null,
        startLng: startLocationCoords?.lng ?? null,
        destLat: destinationCoords?.lat ?? null,
        destLng: destinationCoords?.lng ?? null,
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
    <View style={styles.screen}>
      <GradientBackground style={styles.hero}>
        <View style={{ paddingTop: 20 }}>
          <Text style={styles.heroTitle}>{isEditMode ? "Edit Trip" : "Create a Trip"}</Text>
          <Text style={styles.heroSubtitle}>
            {isEditMode ? "Update your trip details below" : "Share your travel plan and find like-minded companions"}
          </Text>
        </View>
      </GradientBackground>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ padding: 16, paddingBottom: 16 + insets.bottom, gap: 16 }}
      >
        <Card>
          <Text style={styles.sectionHeading}>Trip Basics</Text>
          <View>
            <FieldLabel text="Trip title" required />
            <IconInput
              icon="format-title"
              error={submitted && !title.trim()}
              placeholder="e.g., Spiti Valley Road Trip"
              maxLength={60}
              value={title}
              onChangeText={setTitle}
            />
            <Text style={styles.counter}>{title.length}/60</Text>
          </View>

          {!isEditMode && (
            <View style={{ gap: 12 }}>
              <View>
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
              </View>

              <View>
                <Text style={styles.label}>Additional photos</Text>
                <View style={styles.row}>
                  {images.map((asset) => (
                    <Image key={asset.uri} source={{ uri: asset.uri }} style={styles.thumb} />
                  ))}
                  <TouchableOpacity style={styles.addImage} onPress={pickImages}>
                    <Text style={{ fontSize: 24 }}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}
        </Card>

        <Card>
          <Text style={styles.sectionHeading}>Route</Text>
          <View style={styles.row}>
            <View style={styles.flex1}>
              <FieldLabel text="Starting location" required />
              <IconInput
                icon="map-marker-outline"
                error={submitted && !startLocation.trim()}
                placeholder="e.g., Chennai, India"
                value={startLocation}
                onChangeText={(text) => {
                  setStartLocation(text);
                  if (startLocationCoords) setStartLocationCoords(null);
                }}
              />
              <TouchableOpacity style={styles.pickOnMapLink} onPress={() => setActivePicker("start")}>
                <MaterialCommunityIcons name="map-marker-radius-outline" size={14} color={COLORS.primary} />
                <Text style={styles.pickOnMapText}>Pick on map</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.flex1}>
              <FieldLabel text="Destination" required />
              <IconInput
                icon="flag-checkered"
                error={submitted && !destination.trim()}
                placeholder="e.g., Ladakh, India"
                value={destination}
                onChangeText={(text) => {
                  setDestination(text);
                  if (destinationCoords) setDestinationCoords(null);
                }}
              />
              <TouchableOpacity style={styles.pickOnMapLink} onPress={() => setActivePicker("destination")}>
                <MaterialCommunityIcons name="map-marker-radius-outline" size={14} color={COLORS.primary} />
                <Text style={styles.pickOnMapText}>Pick on map</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Card>

        <LocationPickerModal
          visible={activePicker === "start"}
          title="Starting Location"
          initialValue={startLocationCoords ? { name: startLocation, ...startLocationCoords } : null}
          onClose={() => setActivePicker(null)}
          onSelect={(value: LocationValue) => {
            setStartLocation(value.name);
            setStartLocationCoords({ lat: value.lat, lng: value.lng });
            setActivePicker(null);
          }}
        />
        <LocationPickerModal
          visible={activePicker === "destination"}
          title="Destination"
          initialValue={destinationCoords ? { name: destination, ...destinationCoords } : null}
          onClose={() => setActivePicker(null)}
          onSelect={(value: LocationValue) => {
            setDestination(value.name);
            setDestinationCoords({ lat: value.lat, lng: value.lng });
            setActivePicker(null);
          }}
        />

        <Card>
          <Text style={styles.sectionHeading}>When</Text>
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
            onChangeStart={handleStartDateChange}
            onChangeEnd={setEndDate}
            endError={submitted && !endDate}
            inputStyle={styles.dateField}
            errorStyle={styles.inputError}
            placeholderStyle={styles.placeholderText}
          />
        </Card>

        <Card>
          <Text style={styles.sectionHeading}>Travel & Capacity</Text>
          <View>
            <FieldLabel text="Travel mode" required />
            <Text style={styles.helperText}>How will you travel?</Text>
            <View style={[styles.modeGrid, submitted && !travelMode && styles.selectorError]}>
              {TRAVEL_MODES.map((mode) => (
                <SelectableChip
                  key={mode}
                  icon={TRAVEL_MODE_ICONS[mode]}
                  label={travelModeText(mode)}
                  active={travelMode === mode}
                  onPress={() => setTravelMode(mode)}
                  style={styles.modeChip}
                />
              ))}
            </View>
          </View>

          <View style={styles.row}>
            <View style={styles.flex1}>
              <FieldLabel text="Budget (₹, optional)" />
              <IconInput
                icon="currency-inr"
                placeholder="e.g., 10000"
                keyboardType="numeric"
                value={budget}
                onChangeText={setBudget}
              />
            </View>
            <View style={styles.flex1}>
              <FieldLabel text="Seats available" required />
              <IconInput
                icon="account-multiple"
                error={submitted && (!seats.trim() || Number(seats) < 1)}
                placeholder="e.g., 4"
                keyboardType="numeric"
                value={seats}
                onChangeText={setSeats}
              />
            </View>
          </View>
        </Card>

        <Card>
          <Text style={styles.sectionHeading}>Details</Text>
          <View>
            <FieldLabel text="Describe the trip" required />
            <IconInput
              icon="text-box-outline"
              error={submitted && !description.trim()}
              placeholder="Add a short description"
              multiline
              maxLength={500}
              value={description}
              onChangeText={setDescription}
            />
            <Text style={styles.counter}>{description.length}/500</Text>
          </View>

          <View>
            <FieldLabel text="Places to visit (comma-separated)" />
            <IconInput
              icon="map-marker-multiple"
              placeholder="Places to visit"
              value={placesToVisit}
              onChangeText={setPlacesToVisit}
            />
          </View>

          <View>
            <FieldLabel text="Special notes (optional)" />
            <IconInput
              icon="note-text-outline"
              placeholder="Add any notes"
              multiline
              value={notes}
              onChangeText={setNotes}
            />
          </View>

          <View>
            <FieldLabel text="Who can join?" required />
            <View style={[styles.joinTypeList, submitted && !joinType && styles.selectorError]}>
              {JOIN_TYPES.map((jt) => (
                <SelectableChip
                  key={jt.value}
                  icon={jt.icon}
                  label={jt.label}
                  active={joinType === jt.value}
                  onPress={() => setJoinType(jt.value)}
                  style={styles.joinTypeChip}
                />
              ))}
            </View>
          </View>
        </Card>

        <PrimaryButton
          label={isEditMode ? "Save Changes" : "Publish Trip"}
          onPress={onSubmit}
          disabled={isSubmitting}
          loading={isSubmitting}
          icon={isEditMode ? "check" : "arrow-right"}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.fieldBg },
  hero: { paddingHorizontal: 20, paddingBottom: 24 },
  heroTitle: { color: COLORS.white, fontSize: 22, fontWeight: "800" },
  heroSubtitle: { color: "rgba(255,255,255,0.85)", fontSize: 13, marginTop: 4 },
  scroll: { flex: 1 },
  sectionHeading: { ...TYPE.heading, fontSize: 16 },
  label: { ...TYPE.label, marginTop: 4 },
  required: { color: COLORS.danger },
  counter: { alignSelf: "flex-end", fontSize: 11, color: COLORS.mutedLight, marginTop: 2 },
  helperText: { fontSize: 12, color: COLORS.muted, marginTop: -2, marginBottom: 8 },
  row: { flexDirection: "row", gap: 10 },
  flex1: { flex: 1 },
  inputError: { borderColor: COLORS.danger },
  placeholderText: { color: COLORS.mutedLight },
  selectorError: { borderWidth: 1, borderColor: COLORS.danger, borderRadius: RADIUS.field, padding: 6 },
  dateField: {
    backgroundColor: COLORS.fieldBg,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.field,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  modeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8, width: "100%" },
  modeChip: { flexBasis: "48%", flexGrow: 1, flexShrink: 1, minWidth: 0 },
  joinTypeList: { gap: 8, marginTop: 8 },
  joinTypeChip: { width: "100%", justifyContent: "flex-start", paddingHorizontal: 14 },
  pickOnMapLink: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6 },
  pickOnMapText: { color: COLORS.primary, fontSize: 12, fontWeight: "600" },
  coverPicker: {
    height: 150,
    borderRadius: RADIUS.field,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.fieldBg,
    gap: 6,
  },
  coverPickerText: { color: COLORS.muted, fontSize: 13, fontWeight: "600" },
  coverPreview: { width: "100%", height: 150, borderRadius: RADIUS.field },
  coverChangeBadge: {
    position: "absolute",
    right: 10,
    bottom: 10,
    backgroundColor: "rgba(15,23,42,0.75)",
    borderRadius: RADIUS.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  coverChangeText: { color: COLORS.white, fontSize: 11, fontWeight: "700" },
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
});
