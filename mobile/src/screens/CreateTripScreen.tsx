import { useEffect, useMemo, useState, type ComponentProps, type ReactNode } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AppStackParamList } from "../navigation/types";
import { useCreateTrip, useTrip, useUpdateTrip, useUploadTripImages } from "../api/trips";
import { TRAVEL_MODES, type JoinType, type TravelMode } from "../types";
import { TRAVEL_MODE_ICONS, travelModeText } from "../utils/travelModeIcons";
import { TripDateFields } from "../components/TripDateFields";
import { LocationPickerModal, type LocationValue } from "../components/LocationPickerModal";
import { ScreenHeader } from "../components/theme/ScreenHeader";
import { IconInput } from "../components/theme/IconInput";
import { PlannerAside, PlannerBanner } from "../components/createTrip/PlannerScenery";
import {
  CoverDropzone,
  FieldError,
  FieldLabel,
  FlightArt,
  FormSection,
  Hint,
  OptionPill,
  PhotoStrip,
  RadioOption,
  RouteArt,
} from "../components/createTrip/FormParts";
import { ACTION_BLUE, RADIUS, SHADOW } from "../theme/tokens";
import { DESKTOP_MIN_WIDTH } from "../theme/layout";
import { useTheme } from "../theme/ThemeContext";
import type { Palette } from "../theme/palettes";
import { Alert } from "../utils/alert";
import { useAppConfig } from "../api/config";
import { isAfterDate, isBeforeToday } from "../utils/date";

type Props = NativeStackScreenProps<AppStackParamList, "CreateTrip">;
type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

const JOIN_TYPES: { value: JoinType; label: string }[] = [
  { value: "OPEN", label: "Open to everyone" },
  { value: "APPROVAL", label: "Requires approval" },
];

// The upload route takes at most 8 images: the cover plus 7 more.
const MAX_EXTRA_PHOTOS = 7;
const FORM_MAX_WIDTH = 900;

function LocationLink({ onPress, color }: { onPress: () => void; color: string }) {
  return (
    <Pressable onPress={onPress} style={styles.mapLink} accessibilityRole="button" hitSlop={6}>
      <MaterialCommunityIcons name="map-search-outline" size={15} color={color} />
      <Text style={[styles.mapLinkText, { color }]}>Pick on map</Text>
    </Pressable>
  );
}

export function CreateTripScreen({ navigation, route }: Props) {
  const tripId = route.params?.tripId;
  const isEditMode = !!tripId;
  const { data: existingTrip, isLoading: isLoadingTrip } = useTrip(tripId);
  const disabledModes = useAppConfig().data?.disabledTravelModes ?? [];
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
  const { width: windowWidth } = useWindowDimensions();
  const { colors, scheme } = useTheme();
  const s = useMemo(() => createStyles(colors), [colors]);

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
      selectionLimit: Math.max(1, MAX_EXTRA_PHOTOS - images.length),
      quality: 0.7,
    });
    if (!result.canceled) {
      setImages((prev) => [...prev, ...result.assets].slice(0, MAX_EXTRA_PHOTOS));
    }
  };

  // Web drag and drop; files that aren't images or are over 10 MB are skipped.
  const warnRejected = (rejected: number) => {
    if (rejected > 0) Alert.alert("Some files were skipped", "Only images up to 10 MB can be added, and at most 7 extra photos.");
  };
  const onDropCover = (assets: ImagePicker.ImagePickerAsset[], rejected: number) => {
    if (assets[0]) setCoverPhoto(assets[0]);
    warnRejected(rejected);
  };
  const onDropImages = (assets: ImagePicker.ImagePickerAsset[], rejected: number) => {
    setImages((prev) => [...prev, ...assets].slice(0, MAX_EXTRA_PHOTOS));
    warnRejected(rejected);
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

  // Layout: a scenic column beside the form on desktop, a banner above it otherwise.
  const wide = windowWidth >= DESKTOP_MIN_WIDTH;
  const asideWidth = windowWidth >= 1280 ? 340 : 300;
  const gutter = wide ? 28 : windowWidth >= 600 ? 20 : 14;
  const formWidth = Math.min((wide ? windowWidth - asideWidth : windowWidth) - gutter * 2, FORM_MAX_WIDTH);
  const twoCol = formWidth >= 640;
  const modeColumns = formWidth >= 600 ? 3 : 2;
  const [modeGridWidth, setModeGridWidth] = useState(0);
  const modeWidth = modeGridWidth ? (modeGridWidth - 10 * (modeColumns - 1)) / modeColumns : undefined;
  const [showModeInfo, setShowModeInfo] = useState(false);
  const [showJoinInfo, setShowJoinInfo] = useState(false);
  const blue = scheme === "dark" ? "#93b4fb" : ACTION_BLUE;
  const teal = colors.primary;

  const errors = submitted
    ? {
        title: !title.trim() && "Give your trip a title",
        startLocation: !startLocation.trim() && "Where does the trip start?",
        destination: !destination.trim() && "Where are you headed?",
        endDate: !endDate && "Pick an end date",
        travelMode: !travelMode && "Choose how you'll travel",
        seats: (!seats.trim() || Number(seats) < 1) && "Enter at least 1 seat",
        description: !description.trim() && "Tell people what the trip is about",
        joinType: !joinType && "Choose who can join",
      }
    : null;

  const leave = () => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate("Tabs"));

  const header = (
    <ScreenHeader
      title={isEditMode ? "Edit Trip" : "Create a Trip"}
      subtitle={isEditMode ? "Update your trip details below" : "Share your travel plan and find like-minded companions"}
      showBack
      maxWidth={FORM_MAX_WIDTH + gutter * 2}
    />
  );

  const shell = (content: ReactNode) => (
    <View style={s.screen}>
      {wide && <PlannerAside width={asideWidth} />}
      <View style={s.main}>{content}</View>
    </View>
  );

  if (isEditMode && (isLoadingTrip || !prefilled)) {
    return shell(
      <>
        {header}
        <ActivityIndicator style={{ marginTop: 40 }} size="large" color={colors.primary} />
      </>
    );
  }

  const half = twoCol ? styles.half : styles.full;

  return shell(
    <>
      <ScrollView style={s.scroll} contentContainerStyle={[s.form, { paddingHorizontal: gutter, maxWidth: FORM_MAX_WIDTH + gutter * 2 }]} keyboardShouldPersistTaps="handled">
        <View style={{ marginHorizontal: -gutter }}>{header}</View>
        {!wide && <PlannerBanner compact={windowWidth < 600} />}

        <FormSection icon="calendar-month-outline" tint="blue" title="Trip Basics" subtitle={isEditMode ? "Your trip's title" : "Give your trip a title and cover photo"} index={0}>
          <View style={styles.row}>
            <View style={isEditMode ? styles.full : half}>
              <FieldLabel text="Trip title" required />
              <IconInput
                icon="format-title"
                error={!!errors?.title}
                placeholder="e.g. Himalayan Trek"
                maxLength={60}
                value={title}
                onChangeText={setTitle}
                accessibilityLabel="Trip title"
              />
              <View style={styles.underRow}>
                <FieldError message={errors?.title} />
                <Text style={[styles.counter, { color: colors.mutedLight }]}>{title.length}/60</Text>
              </View>
            </View>
            {!isEditMode && (
              <View style={half}>
                <FieldLabel text="Cover photo" />
                <CoverDropzone photo={coverPhoto} onPick={pickCoverPhoto} onDropFiles={onDropCover} onRemove={() => setCoverPhoto(null)} />
              </View>
            )}
          </View>
          {!isEditMode && (
            <View>
              <FieldLabel text="Additional photos (optional)" />
              <PhotoStrip
                photos={images}
                max={MAX_EXTRA_PHOTOS}
                onAdd={pickImages}
                onDropFiles={onDropImages}
                onRemove={(uri) => setImages((prev) => prev.filter((p) => p.uri !== uri))}
              />
            </View>
          )}
        </FormSection>

        <FormSection icon="map-marker-radius" tint="teal" title="Route" subtitle="Plan your journey from start to destination" index={1} decoration={formWidth >= 560 ? <RouteArt /> : undefined}>
          <View style={styles.row}>
            <View style={half}>
              <FieldLabel text="Starting location" required />
              <IconInput
                icon="map-marker-outline"
                error={!!errors?.startLocation}
                placeholder="e.g. Chennai, India"
                value={startLocation}
                onChangeText={(text) => {
                  setStartLocation(text);
                  if (startLocationCoords) setStartLocationCoords(null);
                }}
                accessibilityLabel="Starting location"
              />
              <FieldError message={errors?.startLocation} />
              <LocationLink onPress={() => setActivePicker("start")} color={teal} />
            </View>
            <View style={half}>
              <FieldLabel text="Destination" required />
              <IconInput
                icon="flag-outline"
                error={!!errors?.destination}
                placeholder="e.g. Ladakh, India"
                value={destination}
                onChangeText={(text) => {
                  setDestination(text);
                  if (destinationCoords) setDestinationCoords(null);
                }}
                accessibilityLabel="Destination"
              />
              <FieldError message={errors?.destination} />
              <LocationLink onPress={() => setActivePicker("destination")} color={teal} />
            </View>
          </View>
          <View>
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
              endError={!!errors?.endDate}
              inputStyle={s.dateField}
              errorStyle={s.inputError}
              placeholderStyle={s.placeholderText}
            />
            <View style={styles.row}>
              <View style={styles.flex1} />
              <View style={styles.flex1}>
                <FieldError message={errors?.endDate} />
              </View>
            </View>
          </View>
        </FormSection>

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

        <FormSection icon="account-group" tint="violet" title="Travel & Capacity" subtitle="Choose how you will travel and set your preferences" index={2} decoration={formWidth >= 640 ? <FlightArt /> : undefined}>
          <View>
            <FieldLabel text="Travel mode" required info onInfo={() => setShowModeInfo((v) => !v)} />
            {showModeInfo && <Hint>The main way the group gets around. Travelers can filter trips by it on Discover.</Hint>}
            <View
              style={[styles.modeGrid, errors?.travelMode && s.selectorError]}
              onLayout={(e) => setModeGridWidth(e.nativeEvent.layout.width)}
              accessibilityRole="radiogroup"
              accessibilityLabel="Travel mode"
            >
              {TRAVEL_MODES.filter((m) => !disabledModes.includes(m) || m === existingTrip?.travelMode).map((mode) => (
                <OptionPill
                  key={mode}
                  icon={TRAVEL_MODE_ICONS[mode] as IconName}
                  label={travelModeText(mode)}
                  selected={travelMode === mode}
                  onPress={() => setTravelMode(mode)}
                  style={modeWidth ? { width: modeWidth } : styles.modeFallback}
                  compact={modeColumns === 2}
                />
              ))}
            </View>
            <FieldError message={errors?.travelMode} />
          </View>

          <View style={styles.row}>
            <View style={half}>
              <FieldLabel text="Budget (₹, optional)" />
              <IconInput
                icon="currency-inr"
                placeholder="e.g. 10000"
                keyboardType="numeric"
                value={budget}
                onChangeText={(v) => setBudget(v.replace(/[^0-9]/g, ""))}
                accessibilityLabel="Budget in rupees"
              />
            </View>
            <View style={half}>
              <FieldLabel text="Seats available" required />
              <IconInput
                icon="account-group-outline"
                error={!!errors?.seats}
                placeholder="e.g. 4"
                keyboardType="numeric"
                value={seats}
                onChangeText={(v) => setSeats(v.replace(/[^0-9]/g, ""))}
                accessibilityLabel="Seats available"
              />
              <FieldError message={errors?.seats} />
            </View>
          </View>
        </FormSection>

        <FormSection icon="text-box-outline" tint="blue" title="Details" subtitle="Add more information about your trip" index={3}>
          <View>
            <FieldLabel text="Describe the trip" required />
            <IconInput
              icon="pencil-outline"
              error={!!errors?.description}
              placeholder="Tell us what makes this trip special…"
              multiline
              maxLength={500}
              value={description}
              onChangeText={setDescription}
              accessibilityLabel="Trip description"
            />
            <View style={styles.underRow}>
              <FieldError message={errors?.description} />
              <Text style={[styles.counter, { color: colors.mutedLight }]}>{description.length}/500</Text>
            </View>
          </View>

          <View style={styles.row}>
            <View style={half}>
              <FieldLabel text="Places to visit (comma-separated)" />
              <IconInput icon="map-marker-multiple-outline" placeholder="e.g. Goa, Munnar, Coorg" value={placesToVisit} onChangeText={setPlacesToVisit} accessibilityLabel="Places to visit" />
            </View>
            <View style={half}>
              <FieldLabel text="Special notes (optional)" />
              <IconInput icon="star-outline" placeholder="Any additional notes…" value={notes} onChangeText={setNotes} accessibilityLabel="Special notes" />
            </View>
          </View>

          <View>
            <View style={[styles.joinRow, errors?.joinType && s.selectorError]} accessibilityRole="radiogroup" accessibilityLabel="Who can join">
              <View style={[styles.joinLabel, !twoCol && styles.full]}>
                <FieldLabel text="Who can join?" required info onInfo={() => setShowJoinInfo((v) => !v)} />
              </View>
              {JOIN_TYPES.map((jt) => (
                <RadioOption key={jt.value} label={jt.label} selected={joinType === jt.value} onPress={() => setJoinType(jt.value)} />
              ))}
            </View>
            {showJoinInfo && <Hint>Open: anyone can join right away while seats last. Requires approval: you review each request first.</Hint>}
            <FieldError message={errors?.joinType} />
          </View>
        </FormSection>
      </ScrollView>

      <View style={[s.footer, { paddingHorizontal: gutter, paddingBottom: 12 + insets.bottom }]}>
        <View style={[styles.footerInner, { maxWidth: FORM_MAX_WIDTH }]}>
          <Pressable
            onPress={leave}
            style={(state) => {
              const { hovered } = state as { hovered?: boolean };
              return [s.cancel, hovered && { backgroundColor: colors.fieldBg }];
            }}
            accessibilityRole="button"
          >
            <Text style={[styles.cancelText, { color: colors.ink }]}>Cancel</Text>
          </Pressable>
          <Pressable
            onPress={onSubmit}
            disabled={isSubmitting}
            style={(state) => {
              const { hovered, pressed } = state as { hovered?: boolean; pressed: boolean };
              return [
                styles.publish,
                WEB_TRANSITION,
                hovered && !isSubmitting && styles.publishHover,
                pressed && { transform: [{ scale: 0.98 }] },
                isSubmitting && { opacity: 0.75 },
              ];
            }}
            accessibilityRole="button"
            accessibilityLabel={isEditMode ? "Save changes" : "Publish trip"}
            accessibilityState={{ disabled: isSubmitting, busy: isSubmitting }}
          >
            <LinearGradient colors={["#2563eb", "#4f46e5"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.publishFill}>
              {isSubmitting ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <MaterialCommunityIcons name={isEditMode ? "check" : "send"} size={19} color="#ffffff" style={!isEditMode && { transform: [{ rotate: "-30deg" }] }} />
              )}
              <Text style={styles.publishText}>{isSubmitting ? (uploadImages.isPending ? "Uploading photos…" : "Saving…") : isEditMode ? "Save Changes" : "Publish Trip"}</Text>
            </LinearGradient>
          </Pressable>
        </View>
      </View>
    </>
  );
}

const WEB_TRANSITION =
  Platform.OS === "web" ? ({ transitionProperty: "transform, box-shadow", transitionDuration: "160ms" } as object) : null;

const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: 18 },
  flex1: { flex: 1 },
  half: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0 },
  full: { width: "100%" },
  underRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8 },
  counter: { fontSize: 12, marginTop: 6, marginLeft: "auto" },
  mapLink: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 8, alignSelf: "flex-start" },
  mapLinkText: { fontSize: 13, fontWeight: "700" },
  modeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  modeFallback: { flexBasis: "30%", flexGrow: 1 },
  joinRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", columnGap: 22, rowGap: 4 },
  joinLabel: { marginBottom: -8 },
  footerInner: { width: "100%", alignSelf: "center", flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  cancelText: { fontSize: 15, fontWeight: "600" },
  publish: { borderRadius: RADIUS.pill, flexGrow: 1, maxWidth: 300, shadowColor: "#2563eb", shadowOpacity: 0.3, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 4 },
  publishHover: { transform: [{ translateY: -1 }], shadowOpacity: 0.42, shadowRadius: 18 },
  publishFill: { height: 52, borderRadius: RADIUS.pill, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingHorizontal: 24 },
  publishText: { color: "#ffffff", fontSize: 16, fontWeight: "800" },
});

function createStyles(colors: Palette) {
  return StyleSheet.create({
    screen: { flex: 1, flexDirection: "row", backgroundColor: colors.surface },
    main: { flex: 1, minWidth: 0 },
    scroll: { flex: 1 },
    form: { width: "100%", alignSelf: "center", gap: 18, paddingBottom: 28 },
    inputError: { borderColor: colors.danger },
    placeholderText: { color: colors.mutedLight },
    selectorError: { borderWidth: 1, borderColor: colors.danger, borderRadius: RADIUS.field, padding: 8 },
    dateField: {
      backgroundColor: colors.fieldBg,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.field,
      paddingHorizontal: 14,
      paddingVertical: 13,
    },
    footer: { borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surfaceElevated, paddingTop: 12, ...SHADOW.card, shadowOffset: { width: 0, height: -4 } },
    cancel: {
      height: 52,
      paddingHorizontal: 30,
      borderRadius: RADIUS.pill,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surfaceElevated,
    },
  });
}
