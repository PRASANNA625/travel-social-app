import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
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
  useWindowDimensions,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { CompositeScreenProps } from "@react-navigation/native";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { AppStackParamList, AppTabParamList } from "../navigation/types";
import { useTrips, useTrendingTrips, useRecommendedTrips, useTrendingDestinations } from "../api/trips";
import { useMe } from "../api/users";
import { TRAVEL_MODES, type TravelMode } from "../types";
import { TripCard } from "../components/TripCard";
import { TripCardSkeleton } from "../components/TripCardSkeleton";
import { TRAVEL_MODE_ICONS, travelModeText } from "../utils/travelModeIcons";
import { getCurrentLocationOrThrow } from "../utils/currentLocation";
import { GradientBackground } from "../components/theme/GradientBackground";
import { DiscoverHeroCarousel } from "../components/DiscoverHeroCarousel";
import { DiscoverSection } from "../components/DiscoverSection";
import { ProfileMenu, type ProfileMenuAnchor } from "../components/ProfileMenu";
import { RADIUS } from "../theme/tokens";
import { useTheme } from "../theme/ThemeContext";
import type { Palette } from "../theme/palettes";
import { optimizedImageUrl } from "../utils/optimizedImage";
import { getUpcomingWeekendRange } from "../utils/weekendRange";
import { ExploreMap, type ExploreMapPanTarget, type ExploreMapPin } from "../components/ExploreMap";
import { TripMapPreviewCard } from "../components/TripMapPreviewCard";

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
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [profileMenuVisible, setProfileMenuVisible] = useState(false);
  const [profileMenuAnchor, setProfileMenuAnchor] = useState<ProfileMenuAnchor | null>(null);
  const avatarWrapRef = useRef<View>(null);
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { height: windowHeight } = useWindowDimensions();

  const { data: me } = useMe();

  const [nearYouCoords, setNearYouCoords] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    getCurrentLocationOrThrow()
      .then((coords) => {
        if (!cancelled) setNearYouCoords(coords);
      })
      .catch(() => {
        // Silent - Near You section simply stays hidden if location isn't available.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const [viewMode, setViewMode] = useState<"list" | "map">("list");
  const [mapUserLocation, setMapUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [previewTripId, setPreviewTripId] = useState<string | null>(null);
  const [panTarget, setPanTarget] = useState<ExploreMapPanTarget | null>(null);
  const mapLocationRequested = useRef(false);

  useEffect(() => {
    if (viewMode !== "map" || mapLocationRequested.current) return;
    mapLocationRequested.current = true;
    if (nearYouCoords) {
      setMapUserLocation(nearYouCoords);
      return;
    }
    let cancelled = false;
    getCurrentLocationOrThrow()
      .then((coords) => {
        if (!cancelled) setMapUserLocation(coords);
      })
      .catch(() => {
        // Silent - the map just opens centered on the default region if location isn't available.
      });
    return () => {
      cancelled = true;
    };
  }, [viewMode, nearYouCoords]);

  const weekendRange = useMemo(() => getUpcomingWeekendRange(), []);

  const { data: trendingTrips, isLoading: trendingLoading } = useTrendingTrips();
  const { data: recommendedTrips, isLoading: recommendedLoading } = useRecommendedTrips();
  const { data: nearYouData, isLoading: nearYouLoading } = useTrips(
    { lat: nearYouCoords?.lat, lng: nearYouCoords?.lng, radiusKm: DEFAULT_RADIUS_KM },
    { enabled: !!nearYouCoords }
  );
  const { data: weekendData, isLoading: weekendLoading } = useTrips(
    { dateFrom: weekendRange.dateFrom, dateTo: weekendRange.dateTo },
    { enabled: true }
  );

  const onSectionTripPress = (trip: { id: string }) => navigation.navigate("TripDetail", { tripId: trip.id });

  const { data, isLoading, isFetching } = useTrips({
    search: search || undefined,
    travelMode: travelModes,
    lat: nearMe?.lat,
    lng: nearMe?.lng,
    radiusKm: nearMe ? radiusKm : undefined,
    sortOrder,
  });

  const mapFilters = {
    search: search || undefined,
    travelMode: travelModes,
    lat: nearMe?.lat ?? mapUserLocation?.lat,
    lng: nearMe?.lng ?? mapUserLocation?.lng,
    radiusKm: nearMe ? radiusKm : undefined,
    sortOrder,
    // pageSize: 200 fetches full Trip records (images, description, etc.) just to
    // plot lat/lng pins - a deliberate MVP tradeoff (the plan explicitly chose
    // reusing GET /trips over building a new viewport/pins-only endpoint). A v2
    // could add a lighter projection (e.g. ?fields=pins) or fetch the tapped
    // trip's full detail lazily via useTrip(tripId) instead of prefetching all 200.
    pageSize: 200,
  };
  const { data: mapData, isLoading: mapLoading } = useTrips(mapFilters, { enabled: viewMode === "map" });
  const { data: trendingDestinations } = useTrendingDestinations();

  const mapPins: ExploreMapPin[] = useMemo(
    () =>
      (mapData?.items ?? [])
        .filter((t) => typeof t.startLat === "number" && typeof t.startLng === "number")
        .map((t) => ({ id: t.id, lat: t.startLat as number, lng: t.startLng as number })),
    [mapData]
  );
  const previewTrip = mapData?.items.find((t) => t.id === previewTripId) ?? null;

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

  const toggleSortOrder = () => {
    setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
  };

  const onAvatarPress = () => {
    avatarWrapRef.current?.measureInWindow((x, y, width, height) => {
      setProfileMenuAnchor({ x, y, width, height });
      setProfileMenuVisible(true);
    });
  };

  return (
    <View style={styles.container}>
      <FlatList
        contentContainerStyle={styles.listContent}
        data={viewMode === "list" ? (data?.items ?? []) : []}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={isFetching}
            onRefresh={() => queryClient.invalidateQueries({ queryKey: ["trips"] })}
          />
        }
        ListHeaderComponent={
          <>
            <GradientBackground style={styles.header}>
              <View style={styles.headerRow}>
                <View>
                  <Text style={styles.greeting}>Hi, {me?.name?.split(" ")[0] ?? "there"} 👋</Text>
                  <Text style={styles.greetingSub}>Where to next?</Text>
                </View>
                <View ref={avatarWrapRef} collapsable={false}>
                  <TouchableOpacity onPress={onAvatarPress} accessibilityRole="button" accessibilityLabel="Profile menu">
                    {me?.photoUrl ? (
                      <Image source={{ uri: optimizedImageUrl(me.photoUrl, 84) }} style={styles.avatar} />
                    ) : (
                      <View style={[styles.avatar, styles.avatarPlaceholder]}>
                        <Text style={styles.avatarInitial}>{(me?.name ?? "?").charAt(0).toUpperCase()}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </GradientBackground>

            <DiscoverHeroCarousel />

            <View style={styles.searchWrap}>
              <MaterialCommunityIcons name="magnify" size={18} color={colors.mutedLight} />
              <TextInput
                style={styles.search}
                placeholder="Search trips, destinations..."
                placeholderTextColor={colors.mutedLight}
                value={search}
                onChangeText={setSearch}
              />
            </View>

            <View style={styles.viewModeRow}>
              <TouchableOpacity
                style={[styles.viewModeButton, viewMode === "list" && styles.viewModeButtonActive]}
                onPress={() => {
                  setViewMode("list");
                  setPanTarget(null);
                  setPreviewTripId(null);
                }}
              >
                <MaterialCommunityIcons
                  name="view-list"
                  size={15}
                  color={viewMode === "list" ? colors.white : colors.ink}
                />
                <Text style={[styles.viewModeButtonText, viewMode === "list" && styles.viewModeButtonTextActive]}>
                  List
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.viewModeButton, viewMode === "map" && styles.viewModeButtonActive]}
                onPress={() => setViewMode("map")}
              >
                <MaterialCommunityIcons name="map" size={15} color={viewMode === "map" ? colors.white : colors.ink} />
                <Text style={[styles.viewModeButtonText, viewMode === "map" && styles.viewModeButtonTextActive]}>
                  Map
                </Text>
              </TouchableOpacity>
            </View>

            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.filterRow}
              contentContainerStyle={styles.filterRowContent}
              data={[
                "NEAR_ME" as const,
                "SORT" as const,
                ...TRAVEL_MODES,
                ...(activeFilterCount > 1 ? (["CLEAR_ALL"] as const) : []),
              ]}
              keyExtractor={(item) => item}
              renderItem={({ item }) => {
                if (item === "SORT") {
                  return (
                    <TouchableOpacity style={styles.chip} onPress={toggleSortOrder}>
                      <MaterialCommunityIcons
                        name={sortOrder === "asc" ? "sort-calendar-ascending" : "sort-calendar-descending"}
                        size={15}
                        color={colors.ink}
                      />
                      <Text style={styles.chipText}>{sortOrder === "asc" ? "Soonest first" : "Latest first"}</Text>
                    </TouchableOpacity>
                  );
                }
                if (item === "NEAR_ME") {
                  return (
                    <TouchableOpacity
                      style={[styles.chip, nearMe && styles.chipActive]}
                      onPress={onNearMePress}
                      disabled={locating}
                    >
                      {locating ? (
                        <ActivityIndicator size="small" color={nearMe ? colors.white : colors.primary} />
                      ) : (
                        <MaterialCommunityIcons name="map-marker" size={15} color={nearMe ? colors.white : colors.ink} />
                      )}
                      <Text style={[styles.chipText, nearMe && styles.chipTextActive]}>
                        {nearMe ? `Near me · ${radiusKm} km` : "Near me"}
                      </Text>
                      {nearMe && (
                        <>
                          <MaterialCommunityIcons name="chevron-down" size={14} color={colors.white} />
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
                      <MaterialCommunityIcons name="close" size={14} color={colors.danger} />
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
                      color={active ? colors.white : colors.ink}
                    />
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{travelModeText(item)}</Text>
                    {active && <MaterialCommunityIcons name="close-circle" size={14} color="rgba(255,255,255,0.85)" />}
                  </TouchableOpacity>
                );
              }}
            />

            {viewMode === "map" && (
              <View style={styles.mapSection}>
                {trendingDestinations && trendingDestinations.length > 0 && (
                  <FlatList
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.trendingChipsRow}
                    contentContainerStyle={styles.trendingChipsRowContent}
                    data={trendingDestinations}
                    keyExtractor={(item) => item.destination}
                    renderItem={({ item }) => (
                      <TouchableOpacity
                        style={styles.trendingChip}
                        onPress={() => setPanTarget({ lat: item.lat, lng: item.lng, zoom: 9 })}
                      >
                        <Text style={styles.trendingChipText}>
                          🔥 {item.destination} · {item.tripCount}
                        </Text>
                      </TouchableOpacity>
                    )}
                  />
                )}
                <View style={[styles.mapAreaWrap, { height: windowHeight * 0.6 }]}>
                  <ExploreMap
                    pins={mapPins}
                    userLocation={mapUserLocation}
                    panTarget={panTarget}
                    onMarkerPress={setPreviewTripId}
                  />
                  {mapData !== undefined && mapPins.length === 0 && (
                    <View style={styles.mapEmptyOverlay} pointerEvents="none">
                      <Text style={styles.mapEmptyText}>No trips with a location match your filters yet.</Text>
                    </View>
                  )}
                  {previewTrip && (
                    <TripMapPreviewCard
                      trip={previewTrip}
                      onPress={() => navigation.navigate("TripDetail", { tripId: previewTrip.id })}
                      onClose={() => setPreviewTripId(null)}
                    />
                  )}
                </View>
              </View>
            )}

            <DiscoverSection
              title="Recommended For You"
              emoji="✨"
              trips={recommendedTrips}
              isLoading={recommendedLoading}
              onTripPress={onSectionTripPress}
            />
            <DiscoverSection
              title="Trending Trips"
              emoji="🔥"
              trips={trendingTrips}
              isLoading={trendingLoading}
              onTripPress={onSectionTripPress}
            />
            <DiscoverSection
              title="Near You"
              emoji="📍"
              trips={nearYouData?.items}
              isLoading={!!nearYouCoords && nearYouLoading}
              onTripPress={onSectionTripPress}
            />
            <DiscoverSection
              title="This Weekend"
              emoji="📅"
              trips={weekendData?.items}
              isLoading={weekendLoading}
              onTripPress={onSectionTripPress}
            />

            {viewMode === "list" && isLoading && (
              <View style={styles.horizontalInset}>
                <TripCardSkeleton />
                <TripCardSkeleton />
                <TripCardSkeleton />
              </View>
            )}
          </>
        }
        ListEmptyComponent={
          isLoading || viewMode === "map" ? null : (
            <View style={styles.emptyWrap}>
              <MaterialCommunityIcons
                name={nearMe ? "map-marker-radius-outline" : "compass-outline"}
                size={40}
                color={colors.mutedLight}
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
          )
        }
        renderItem={({ item }) =>
          isLoading ? null : (
            <View style={styles.horizontalInset}>
              <TripCard trip={item} onPress={() => navigation.navigate("TripDetail", { tripId: item.id })} />
            </View>
          )
        }
      />

      <TouchableOpacity style={styles.fab} onPress={() => navigation.navigate("CreateTrip")} activeOpacity={0.9}>
        <MaterialCommunityIcons name="plus" size={18} color={colors.white} />
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
              <MaterialCommunityIcons name="close-circle-outline" size={16} color={colors.danger} />
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
              <MaterialCommunityIcons name="map-marker-off-outline" size={26} color={colors.danger} />
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

      <ProfileMenu
        visible={profileMenuVisible}
        anchor={profileMenuAnchor}
        onClose={() => setProfileMenuVisible(false)}
        onViewProfile={() => navigation.navigate("Profile")}
        onOpenSettings={() => navigation.navigate("Settings")}
      />
    </View>
  );
}

function createStyles(colors: Palette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.surface },
    header: { paddingBottom: 20 },
    headerRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingTop: 16,
    },
    greeting: { fontSize: 21, fontWeight: "700", color: colors.white },
    greetingSub: { fontSize: 13, color: "rgba(255,255,255,0.85)", marginTop: 2 },
    avatar: { width: 42, height: 42, borderRadius: 21 },
    avatarPlaceholder: { backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
    avatarInitial: { color: colors.white, fontWeight: "700", fontSize: 16 },
    searchWrap: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginHorizontal: 16,
      marginTop: 14,
      backgroundColor: colors.surfaceElevated,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 14,
    },
    search: { flex: 1, paddingVertical: 12, fontSize: 14, color: colors.ink },
    filterRow: { minHeight: 46, marginTop: 12, flexGrow: 0 },
    filterRowContent: { paddingHorizontal: 16, paddingRight: 24, paddingVertical: 4, alignItems: "center", gap: 8 },
    viewModeRow: {
      flexDirection: "row",
      marginHorizontal: 16,
      marginTop: 10,
      backgroundColor: colors.fieldBg,
      borderRadius: RADIUS.pill,
      padding: 3,
      gap: 3,
    },
    viewModeButton: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 5,
      paddingVertical: 8,
      borderRadius: RADIUS.pill,
    },
    viewModeButtonActive: { backgroundColor: colors.primary },
    viewModeButtonText: { fontSize: 12.5, fontWeight: "700", color: colors.ink },
    viewModeButtonTextActive: { color: colors.white },
    mapSection: { marginTop: 4 },
    trendingChipsRow: { minHeight: 40, marginTop: 10, flexGrow: 0 },
    trendingChipsRowContent: { paddingHorizontal: 16, gap: 8, alignItems: "center" },
    trendingChip: {
      backgroundColor: colors.surfaceElevated,
      borderRadius: RADIUS.pill,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderWidth: 1,
      borderColor: colors.border,
    },
    trendingChipText: { fontSize: 12, fontWeight: "600", color: colors.ink },
    mapAreaWrap: {
      marginHorizontal: 16,
      marginTop: 10,
      borderRadius: 16,
      overflow: "hidden",
      position: "relative",
    },
    mapEmptyOverlay: {
      position: "absolute",
      top: 12,
      left: 12,
      right: 12,
      backgroundColor: colors.overlay,
      borderRadius: 12,
      padding: 10,
      alignItems: "center",
    },
    mapEmptyText: { color: colors.white, fontSize: 12, textAlign: "center" },
    chip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      justifyContent: "center",
      minHeight: 38,
      backgroundColor: colors.surfaceElevated,
      borderRadius: RADIUS.pill,
      paddingHorizontal: 14,
      paddingVertical: 9,
      borderWidth: 1,
      borderColor: colors.border,
    },
    chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { fontSize: 12.5, color: colors.ink, fontWeight: "500", includeFontPadding: false },
    chipTextActive: { color: colors.white, fontWeight: "700" },
    chipRemoveButton: { marginLeft: -2 },
    clearAllChip: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 4,
      minHeight: 38,
      backgroundColor: colors.dangerBg,
      borderRadius: RADIUS.pill,
      paddingHorizontal: 12,
      paddingVertical: 9,
      borderWidth: 1,
      borderColor: colors.dangerBorderLight,
    },
    clearAllChipText: { fontSize: 12.5, color: colors.danger, fontWeight: "700", includeFontPadding: false },
    listContent: { paddingBottom: 110 },
    horizontalInset: { paddingHorizontal: 16 },
    emptyWrap: { alignItems: "center", marginTop: 48, gap: 10, paddingHorizontal: 16 },
    empty: { textAlign: "center", color: colors.mutedLight, fontSize: 13, paddingHorizontal: 32 },
    emptyClearLink: { color: colors.primary, fontSize: 13, fontWeight: "700", marginTop: 2 },
    backdrop: {
      flex: 1,
      backgroundColor: colors.overlay,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 24,
    },
    sheet: {
      width: "100%",
      maxWidth: 340,
      backgroundColor: colors.surfaceElevated,
      borderRadius: 20,
      padding: 20,
      shadowColor: colors.ink,
      shadowOpacity: 0.2,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 10 },
      elevation: 10,
    },
    sheetTitle: { fontSize: 16, fontWeight: "700", color: colors.ink, textAlign: "center" },
    sheetSubtitle: { fontSize: 13, color: colors.muted, textAlign: "center", marginTop: 6, lineHeight: 18 },
    radiusOptionsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 16, justifyContent: "center" },
    radiusOption: {
      paddingHorizontal: 16,
      paddingVertical: 9,
      borderRadius: RADIUS.pill,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.fieldBg,
    },
    radiusOptionActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    radiusOptionText: { fontSize: 13, fontWeight: "600", color: colors.ink },
    radiusOptionTextActive: { color: colors.white },
    clearFilterButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      marginTop: 18,
      paddingVertical: 10,
      borderRadius: 12,
      backgroundColor: colors.dangerBg,
    },
    clearFilterText: { color: colors.danger, fontWeight: "700", fontSize: 13 },
    permissionIconWrap: {
      alignSelf: "center",
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: colors.dangerBg,
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
      backgroundColor: colors.fieldBg,
    },
    permissionCancelText: { color: colors.ink, fontWeight: "700", fontSize: 13 },
    permissionRetryButton: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 12,
      alignItems: "center",
      backgroundColor: colors.primary,
    },
    permissionRetryText: { color: colors.white, fontWeight: "700", fontSize: 13 },
    fab: {
      position: "absolute",
      right: 16,
      bottom: 20,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: colors.primary,
      borderRadius: RADIUS.pill,
      paddingVertical: 14,
      paddingHorizontal: 20,
      shadowColor: colors.ink,
      shadowOpacity: 0.25,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 5,
    },
    fabText: { color: colors.white, fontWeight: "700", fontSize: 14 },
  });
}
