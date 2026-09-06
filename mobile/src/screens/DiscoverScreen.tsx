import { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { CompositeScreenProps } from "@react-navigation/native";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { AppStackParamList, AppTabParamList } from "../navigation/types";
import { useTrips } from "../api/trips";
import { useMe } from "../api/users";
import { TRAVEL_MODES, type TravelMode } from "../types";
import { TripCard } from "../components/TripCard";
import { TripCardSkeleton } from "../components/TripCardSkeleton";
import { TRAVEL_MODE_ICONS, travelModeText } from "../utils/travelModeIcons";
import { getCurrentLocationOrThrow } from "../utils/currentLocation";
import { GradientBackground } from "../components/theme/GradientBackground";
import { HeroCarousel } from "../components/HeroCarousel";
import { COLORS, RADIUS } from "../theme/tokens";
import { optimizedImageUrl } from "../utils/optimizedImage";

type Props = CompositeScreenProps<
  BottomTabScreenProps<AppTabParamList, "Discover">,
  NativeStackScreenProps<AppStackParamList>
>;

const RADIUS_OPTIONS_KM = [10, 25, 50, 100];
const DEFAULT_RADIUS_KM = 50;

export function DiscoverScreen({ navigation }: Props) {
  const [search, setSearch] = useState("");
  const [travelModes, setTravelModes] = useState<TravelMode[]>([]);
  const [nearMe, setNearMe] = useState<{ lat: number; lng: number } | null>(null);
  const [radiusKm, setRadiusKm] = useState(DEFAULT_RADIUS_KM);
  const [locating, setLocating] = useState(false);
  const [radiusSheetVisible, setRadiusSheetVisible] = useState(false);
  const [locationDeniedVisible, setLocationDeniedVisible] = useState(false);

  const { data: me } = useMe();

  const { data, isLoading, isFetching, refetch } = useTrips({
    search: search || undefined,
    travelMode: travelModes,
    lat: nearMe?.lat,
    lng: nearMe?.lng,
    radiusKm: nearMe ? radiusKm : undefined,
  });

  const activeFilterCount = travelModes.length + (nearMe ? 1 : 0);

  const toggleTravelMode = (mode: TravelMode) => {
    setTravelModes((prev) => (prev.includes(mode) ? prev.filter((m) => m !== mode) : [...prev, mode]));
  };

  const activateNearMe = async () => {
    setLocating(true);
    try {
      const coords = await getCurrentLocationOrThrow();
      setNearMe(coords);
    } catch {
      setLocationDeniedVisible(true);
    } finally {
      setLocating(false);
    }
  };

  const clearNearMe = () => {
    setNearMe(null);
    setRadiusSheetVisible(false);
  };

  const onNearMePress = () => {
    if (nearMe) {
      setRadiusSheetVisible(true);
    } else {
      activateNearMe();
    }
  };

  const clearAllFilters = () => {
    setTravelModes([]);
    clearNearMe();
  };

  return (
    <View style={styles.container}>
      <GradientBackground style={styles.header}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.greeting}>Hi, {me?.name?.split(" ")[0] ?? "there"} 👋</Text>
            <Text style={styles.greetingSub}>Where to next?</Text>
          </View>
          <TouchableOpacity onPress={() => navigation.navigate("Profile")}>
            {me?.photoUrl ? (
              <Image source={{ uri: optimizedImageUrl(me.photoUrl, 84) }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder]}>
                <Text style={styles.avatarInitial}>{(me?.name ?? "?").charAt(0).toUpperCase()}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </GradientBackground>

      <HeroCarousel />

      <View style={styles.searchWrap}>
        <MaterialCommunityIcons name="magnify" size={18} color={COLORS.mutedLight} />
        <TextInput
          style={styles.search}
          placeholder="Search trips, destinations..."
          placeholderTextColor={COLORS.mutedLight}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterRow}
        contentContainerStyle={styles.filterRowContent}
        data={["NEAR_ME" as const, ...TRAVEL_MODES, ...(activeFilterCount > 1 ? (["CLEAR_ALL"] as const) : [])]}
        keyExtractor={(item) => item}
        renderItem={({ item }) => {
          if (item === "NEAR_ME") {
            return (
              <TouchableOpacity
                style={[styles.chip, nearMe && styles.chipActive]}
                onPress={onNearMePress}
                disabled={locating}
              >
                {locating ? (
                  <ActivityIndicator size="small" color={nearMe ? COLORS.white : COLORS.primary} />
                ) : (
                  <MaterialCommunityIcons name="map-marker" size={15} color={nearMe ? COLORS.white : "#334155"} />
                )}
                <Text style={[styles.chipText, nearMe && styles.chipTextActive]}>
                  {nearMe ? `Near me · ${radiusKm} km` : "Near me"}
                </Text>
                {nearMe && (
                  <>
                    <MaterialCommunityIcons name="chevron-down" size={14} color={COLORS.white} />
                    <TouchableOpacity
                      style={styles.chipRemoveButton}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      onPress={clearNearMe}
                    >
                      <MaterialCommunityIcons name="close-circle" size={14} color="rgba(255,255,255,0.85)" />
                    </TouchableOpacity>
                  </>
                )}
              </TouchableOpacity>
            );
          }
          if (item === "CLEAR_ALL") {
            return (
              <TouchableOpacity style={styles.clearAllChip} onPress={clearAllFilters}>
                <MaterialCommunityIcons name="close" size={14} color={COLORS.danger} />
                <Text style={styles.clearAllChipText}>Clear all</Text>
              </TouchableOpacity>
            );
          }
          const active = travelModes.includes(item);
          return (
            <TouchableOpacity style={[styles.chip, active && styles.chipActive]} onPress={() => toggleTravelMode(item)}>
              <MaterialCommunityIcons
                name={TRAVEL_MODE_ICONS[item]}
                size={15}
                color={active ? COLORS.white : "#334155"}
              />
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{travelModeText(item)}</Text>
              {active && <MaterialCommunityIcons name="close-circle" size={14} color="rgba(255,255,255,0.85)" />}
            </TouchableOpacity>
          );
        }}
      />

      {isLoading ? (
        <View style={styles.list}>
          <TripCardSkeleton />
          <TripCardSkeleton />
          <TripCardSkeleton />
        </View>
      ) : (
        <FlatList
          contentContainerStyle={styles.list}
          data={data?.items ?? []}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} />}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <MaterialCommunityIcons
                name={nearMe ? "map-marker-radius-outline" : "compass-outline"}
                size={40}
                color="#cbd5e1"
              />
              <Text style={styles.empty}>
                {nearMe
                  ? `No trips found within ${radiusKm} km of you.`
                  : "No trips match yet — try widening your filters."}
              </Text>
              {nearMe && (
                <TouchableOpacity onPress={clearNearMe}>
                  <Text style={styles.emptyClearLink}>Clear filter to see all trips</Text>
                </TouchableOpacity>
              )}
            </View>
          }
          renderItem={({ item }) => (
            <TripCard trip={item} onPress={() => navigation.navigate("TripDetail", { tripId: item.id })} />
          )}
        />
      )}

      <TouchableOpacity style={styles.fab} onPress={() => navigation.navigate("CreateTrip")} activeOpacity={0.9}>
        <MaterialCommunityIcons name="plus" size={18} color={COLORS.white} />
        <Text style={styles.fabText}>Create Trip</Text>
      </TouchableOpacity>

      <Modal
        visible={radiusSheetVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setRadiusSheetVisible(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setRadiusSheetVisible(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.sheetTitle}>Near me</Text>
            <Text style={styles.sheetSubtitle}>Showing trips within {radiusKm} km of your location</Text>
            <View style={styles.radiusOptionsRow}>
              {RADIUS_OPTIONS_KM.map((km) => (
                <TouchableOpacity
                  key={km}
                  style={[styles.radiusOption, radiusKm === km && styles.radiusOptionActive]}
                  onPress={() => {
                    setRadiusKm(km);
                    setRadiusSheetVisible(false);
                  }}
                >
                  <Text style={[styles.radiusOptionText, radiusKm === km && styles.radiusOptionTextActive]}>
                    {km} km
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={styles.clearFilterButton} onPress={clearNearMe}>
              <MaterialCommunityIcons name="close-circle-outline" size={16} color={COLORS.danger} />
              <Text style={styles.clearFilterText}>Clear filter</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={locationDeniedVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setLocationDeniedVisible(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setLocationDeniedVisible(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.permissionIconWrap}>
              <MaterialCommunityIcons name="map-marker-off-outline" size={26} color={COLORS.danger} />
            </View>
            <Text style={styles.sheetTitle}>Location access needed</Text>
            <Text style={styles.sheetSubtitle}>
              To show trips near you, we need permission to use your device's location. Please allow location
              access and try again.
            </Text>
            <View style={styles.permissionButtonRow}>
              <TouchableOpacity
                style={styles.permissionCancelButton}
                onPress={() => setLocationDeniedVisible(false)}
              >
                <Text style={styles.permissionCancelText}>Not now</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.permissionRetryButton}
                onPress={() => {
                  setLocationDeniedVisible(false);
                  activateNearMe();
                }}
              >
                <Text style={styles.permissionRetryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.fieldBg },
  header: { paddingBottom: 20 },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  greeting: { fontSize: 21, fontWeight: "700", color: COLORS.white },
  greetingSub: { fontSize: 13, color: "rgba(255,255,255,0.85)", marginTop: 2 },
  avatar: { width: 42, height: 42, borderRadius: 21 },
  avatarPlaceholder: { backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center" },
  avatarInitial: { color: COLORS.white, fontWeight: "700", fontSize: 16 },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 14,
    backgroundColor: COLORS.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
  },
  search: { flex: 1, paddingVertical: 12, fontSize: 14, color: COLORS.ink },
  filterRow: { minHeight: 46, marginTop: 12, flexGrow: 0 },
  filterRowContent: { paddingHorizontal: 16, paddingRight: 24, paddingVertical: 4, alignItems: "center", gap: 8 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    justifyContent: "center",
    minHeight: 38,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { fontSize: 12.5, color: "#334155", fontWeight: "500", includeFontPadding: false },
  chipTextActive: { color: COLORS.white, fontWeight: "700" },
  chipRemoveButton: { marginLeft: -2 },
  clearAllChip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    minHeight: 38,
    backgroundColor: COLORS.dangerBg,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: COLORS.dangerBorderLight,
  },
  clearAllChipText: { fontSize: 12.5, color: COLORS.danger, fontWeight: "700", includeFontPadding: false },
  list: { padding: 16, paddingBottom: 110 },
  emptyWrap: { alignItems: "center", marginTop: 48, gap: 10 },
  empty: { textAlign: "center", color: COLORS.mutedLight, fontSize: 13, paddingHorizontal: 32 },
  emptyClearLink: { color: COLORS.primary, fontSize: 13, fontWeight: "700", marginTop: 2 },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.4)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  sheet: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: COLORS.white,
    borderRadius: 20,
    padding: 20,
    shadowColor: COLORS.ink,
    shadowOpacity: 0.2,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  sheetTitle: { fontSize: 16, fontWeight: "700", color: COLORS.ink, textAlign: "center" },
  sheetSubtitle: { fontSize: 13, color: COLORS.muted, textAlign: "center", marginTop: 6, lineHeight: 18 },
  radiusOptionsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 16, justifyContent: "center" },
  radiusOption: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.fieldBg,
  },
  radiusOptionActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  radiusOptionText: { fontSize: 13, fontWeight: "600", color: "#334155" },
  radiusOptionTextActive: { color: COLORS.white },
  clearFilterButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 18,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: COLORS.dangerBg,
  },
  clearFilterText: { color: COLORS.danger, fontWeight: "700", fontSize: 13 },
  permissionIconWrap: {
    alignSelf: "center",
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.dangerBg,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  permissionButtonRow: { flexDirection: "row", gap: 10, marginTop: 18 },
  permissionCancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    backgroundColor: "#f1f5f9",
  },
  permissionCancelText: { color: "#334155", fontWeight: "700", fontSize: 13 },
  permissionRetryButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    backgroundColor: COLORS.primary,
  },
  permissionRetryText: { color: COLORS.white, fontWeight: "700", fontSize: 13 },
  fab: {
    position: "absolute",
    right: 16,
    bottom: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.pill,
    paddingVertical: 14,
    paddingHorizontal: 20,
    shadowColor: COLORS.ink,
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  fabText: { color: COLORS.white, fontWeight: "700", fontSize: 14 },
});
