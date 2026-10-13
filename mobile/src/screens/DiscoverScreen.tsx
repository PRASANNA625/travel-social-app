import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  ActivityIndicator,
  Animated,
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
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { CompositeScreenProps } from "@react-navigation/native";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { AppStackParamList, AppTabParamList } from "../navigation/types";
import { useTrips, useTrendingTrips, useRecommendedTrips, useTrendingDestinations } from "../api/trips";
import { useMe } from "../api/users";
import { TRAVEL_MODES, type TravelMode, type Trip } from "../types";
import { TripCard } from "../components/TripCard";
import { TripCardSkeleton } from "../components/TripCardSkeleton";
import { ViewModeToggle, type ViewModeToggleOption } from "../components/ViewModeToggle";
import { TRAVEL_MODE_ICONS, travelModeText } from "../utils/travelModeIcons";
import { getCurrentLocationOrThrow } from "../utils/currentLocation";
import { HERO_PHOTO, HERO_PHOTO_ASPECT } from "../utils/coverPhotos";
import { DiscoverSection, SECTION_GAP } from "../components/DiscoverSection";
import { ProfileMenu, type ProfileMenuAnchor } from "../components/ProfileMenu";
import { RADIUS } from "../theme/tokens";
import { useTheme } from "../theme/ThemeContext";
import type { Palette } from "../theme/palettes";
import { CONTENT_MAX_WIDTH, gridColumnsFor, useResponsiveLayout } from "../theme/layout";
import { optimizedImageUrl } from "../utils/optimizedImage";
import { getUpcomingWeekendRange } from "../utils/weekendRange";
import { ExploreMap, type ExploreMapPanTarget, type ExploreMapPin } from "../components/ExploreMap";
import { TripMapPreviewCard } from "../components/TripMapPreviewCard";
import { useBuddyMatches, useSendBuddyRequest } from "../api/buddies";
import { BuddyCard } from "../components/BuddyCard";
import { BuddyCardSkeleton } from "../components/BuddyCardSkeleton";
import { Alert } from "../utils/alert";

type Props = CompositeScreenProps<
  BottomTabScreenProps<AppTabParamList, "Discover">,
  NativeStackScreenProps<AppStackParamList>
>;

const RADIUS_OPTIONS_KM = [10, 25, 50, 100];
const DEFAULT_RADIUS_KM = 50;

type DiscoverView = "grid" | "list" | "map";

const VIEW_OPTIONS: readonly ViewModeToggleOption<DiscoverView>[] = [
  { value: "grid", icon: "view-grid-outline", label: "Grid" },
  { value: "list", icon: "view-agenda-outline", label: "List" },
  { value: "map", icon: "map-marker-outline", label: "Map" },
];

const SORT_OPTIONS: readonly ViewModeToggleOption<"asc" | "desc">[] = [
  { value: "asc", icon: "sort-calendar-ascending", label: "Soonest" },
  { value: "desc", icon: "sort-calendar-descending", label: "Latest" },
];

const VIEW_LAYOUT_STORAGE_KEY = "discover_view_layout";
const CHIP_SCROLL_STEP = 360;

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
  const [heroSize, setHeroSize] = useState({ width: 0, height: 0 });
  const heroPhotoHeight = Math.max(heroSize.height, heroSize.width / HERO_PHOTO_ASPECT);
  const [profileMenuAnchor, setProfileMenuAnchor] = useState<ProfileMenuAnchor | null>(null);
  const avatarWrapRef = useRef<View>(null);
  const chipListRef = useRef<FlatList<string>>(null);
  const [chipScroll, setChipScroll] = useState({ offset: 0, contentWidth: 0, viewportWidth: 0 });
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const { isDesktop, contentWidth, height: windowHeight } = useResponsiveLayout();

  const pad = isDesktop ? 24 : 16;
  const innerWidth = contentWidth - pad * 2;

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

  const onViewModeChange = (next: "list" | "map") => {
    setViewMode(next);
    if (next === "list") {
      setPanTarget(null);
      setPreviewTripId(null);
    }
  };

  const [viewLayout, setViewLayoutState] = useState<"grid" | "list">("grid");

  useEffect(() => {
    AsyncStorage.getItem(VIEW_LAYOUT_STORAGE_KEY)
      .then((stored) => {
        if (stored === "grid" || stored === "list") setViewLayoutState(stored);
      })
      .catch(() => {});
  }, []);

  const setViewLayout = (next: "grid" | "list") => {
    setViewLayoutState(next);
    AsyncStorage.setItem(VIEW_LAYOUT_STORAGE_KEY, next).catch(() => {});
  };

  const activeView: DiscoverView = viewMode === "map" ? "map" : viewLayout;

  const onViewChange = (next: DiscoverView) => {
    if (next === "map") {
      onViewModeChange("map");
    } else {
      onViewModeChange("list");
      setViewLayout(next);
    }
  };

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
  const { data: buddyMatches, isLoading: buddiesLoading } = useBuddyMatches({ pageSize: 6 });
  const sendBuddyRequest = useSendBuddyRequest();

  const onSectionTripPress = (trip: { id: string }) => navigation.navigate("TripDetail", { tripId: trip.id });

  const onConnectBuddy = (userId: string) => {
    sendBuddyRequest.mutate(userId, {
      onSuccess: () => Alert.alert("Request sent", "We'll let you know when they respond."),
      onError: (err: any) => Alert.alert("Couldn't send request", err?.response?.data?.error ?? "Please try again."),
    });
  };

  const { data, isLoading, isFetching } = useTrips({
    search: search || undefined,
    travelMode: travelModes,
    lat: nearMe?.lat,
    lng: nearMe?.lng,
    radiusKm: nearMe ? radiusKm : undefined,
    sortOrder,
  });

  // Carousels show as many cards per screen as the grid has columns; on phones
  // one card plus a peek of the next.
  const sectionColumns = gridColumnsFor(contentWidth);
  const sectionCardWidth =
    sectionColumns === 1
      ? Math.min(innerWidth * 0.86, 340)
      : (innerWidth - (sectionColumns - 1) * SECTION_GAP) / sectionColumns;

  const rowSize = viewLayout === "list" ? (innerWidth >= 900 ? 2 : 1) : gridColumnsFor(contentWidth);

  const rows = useMemo(() => {
    const items = viewMode === "list" ? (data?.items ?? []) : [];
    const grouped: (typeof items)[number][][] = [];
    for (let i = 0; i < items.length; i += rowSize) {
      grouped.push(items.slice(i, i + rowSize));
    }
    return grouped;
  }, [data, viewMode, rowSize]);

  const fadeAnim = useRef(new Animated.Value(1)).current;
  const isFirstLayoutRender = useRef(true);

  useEffect(() => {
    if (isFirstLayoutRender.current) {
      isFirstLayoutRender.current = false;
      return;
    }
    Animated.sequence([
      Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 150, useNativeDriver: true }),
    ]).start();
    return () => fadeAnim.stopAnimation();
  }, [viewLayout, fadeAnim]);

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

  // Featured = trending trips; when nothing is trending yet, trips from the main list
  // with open ones first, then the most liked/discussed.
  const featuredTrips = useMemo(() => {
    if (trendingTrips && trendingTrips.length > 0) return trendingTrips;
    const isOpen = (t: Trip) => t.status === "OPEN" || t.status === "ALMOST_FULL";
    const engagement = (t: Trip) => t._count.likes + t._count.comments + t._count.joinRequests;
    return [...(data?.items ?? [])]
      .sort((a, b) => Number(isOpen(b)) - Number(isOpen(a)) || engagement(b) - engagement(a))
      .slice(0, 8);
  }, [trendingTrips, data]);

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

  const onAvatarPress = () => {
    avatarWrapRef.current?.measureInWindow((x, y, width, height) => {
      setProfileMenuAnchor({ x, y, width, height });
      setProfileMenuVisible(true);
    });
  };

  const onChipScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    setChipScroll({ offset: contentOffset.x, contentWidth: contentSize.width, viewportWidth: layoutMeasurement.width });
  };

  const scrollChips = (direction: 1 | -1) => {
    chipListRef.current?.scrollToOffset({
      offset: Math.max(0, chipScroll.offset + direction * CHIP_SCROLL_STEP),
      animated: true,
    });
  };

  const canScrollChipsBack = chipScroll.offset > 4;
  const canScrollChipsForward = chipScroll.offset + chipScroll.viewportWidth < chipScroll.contentWidth - 4;
  const firstName = me?.name?.split(" ")[0] ?? "there";

  const chipItems: string[] = [
    "ALL",
    "NEAR_ME",
    ...TRAVEL_MODES,
    ...(activeFilterCount > 1 ? ["CLEAR_ALL"] : []),
  ];

  const renderChip = (item: string) => {
    if (item === "ALL") {
      const active = travelModes.length === 0;
      return (
        <TouchableOpacity style={[styles.chip, active && styles.chipActive]} onPress={() => setTravelModes([])}>
          <MaterialCommunityIcons name="view-grid-outline" size={15} color={active ? colors.white : colors.primary} />
          <Text style={[styles.chipText, active && styles.chipTextActive]}>All</Text>
        </TouchableOpacity>
      );
    }
    if (item === "NEAR_ME") {
      return (
        <TouchableOpacity style={[styles.chip, nearMe && styles.chipActive]} onPress={onNearMePress} disabled={locating}>
          {locating ? (
            <ActivityIndicator size="small" color={nearMe ? colors.white : colors.primary} />
          ) : (
            <MaterialCommunityIcons name="map-marker" size={15} color={nearMe ? colors.white : colors.danger} />
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
    const mode = item as TravelMode;
    const active = travelModes.includes(mode);
    return (
      <TouchableOpacity style={[styles.chip, active && styles.chipActive]} onPress={() => toggleTravelMode(mode)}>
        <MaterialCommunityIcons name={TRAVEL_MODE_ICONS[mode]} size={15} color={active ? colors.white : colors.primary} />
        <Text style={[styles.chipText, active && styles.chipTextActive]}>{travelModeText(mode)}</Text>
        {active && <MaterialCommunityIcons name="close-circle" size={14} color="rgba(255,255,255,0.85)" />}
      </TouchableOpacity>
    );
  };

  const hero = (
    <View
      style={[
        styles.hero,
        { paddingTop: insets.top + (isDesktop ? 32 : 18), paddingHorizontal: isDesktop ? 32 : pad },
        isDesktop && styles.heroDesktop,
      ]}
      onLayout={(e) => setHeroSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
    >
      {/* Panorama sized to cover the banner; if the banner is shorter than the photo, crop from
          ~45% down at most (keeps the lake), never leaving a gap below. */}
      <Image
        source={HERO_PHOTO}
        resizeMode="cover"
        style={[
          styles.heroPhoto,
          {
            height: heroPhotoHeight,
            top: Math.max(heroSize.height - heroPhotoHeight, -0.45 * heroPhotoHeight),
          },
        ]}
      />
      <LinearGradient
        colors={["rgba(37,99,235,0.35)", "rgba(37,99,235,0)"]}
        locations={[0, 0.6]}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={["rgba(8,20,40,0.62)", "rgba(8,20,40,0.25)", "rgba(8,20,40,0.05)"]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={StyleSheet.absoluteFill}
      />
      {isDesktop && (
        <Text style={styles.heroTagline} accessibilityElementsHidden importantForAccessibility="no">
          Explore{"\n"}Connect{"\n"}Belong
        </Text>
      )}

      <View style={styles.heroTopRow}>
        <View style={styles.heroTitleBlock}>
          {!isDesktop && <Text style={styles.heroKicker}>Hi, {firstName} 👋</Text>}
          <Text style={[styles.heroTitle, isDesktop && styles.heroTitleDesktop]}>Discover</Text>
          <Text style={styles.heroSubtitle}>
            {isDesktop
              ? "Find amazing trips, meet like-minded travelers and create unforgettable memories."
              : "Find trips and meet like-minded travelers."}
          </Text>
        </View>
        <View style={styles.heroActions}>
          <TouchableOpacity
            style={styles.heroIconButton}
            onPress={() => navigation.navigate("Settings")}
            accessibilityRole="button"
            accessibilityLabel="Settings"
          >
            <MaterialCommunityIcons name="cog-outline" size={20} color="#0f172a" />
          </TouchableOpacity>
          <View ref={avatarWrapRef} collapsable={false}>
            <TouchableOpacity onPress={onAvatarPress} accessibilityRole="button" accessibilityLabel="Profile menu">
              {me?.photoUrl ? (
                <Image source={{ uri: optimizedImageUrl(me.photoUrl, 88) }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarPlaceholder]}>
                  <Text style={styles.avatarInitial}>{(me?.name ?? "?").charAt(0).toUpperCase()}</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
          {isDesktop && (
            <View>
              <Text style={styles.greeting}>Hi, {firstName} 👋</Text>
              <Text style={styles.greetingSub}>Where to next?</Text>
            </View>
          )}
        </View>
      </View>

      <View style={[styles.searchWrap, isDesktop && styles.searchWrapDesktop]}>
        <MaterialCommunityIcons name="magnify" size={20} color="#64748b" />
        <TextInput
          style={styles.search}
          placeholder="Search trips, destinations..."
          placeholderTextColor="#94a3b8"
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch("")} hitSlop={8} accessibilityLabel="Clear search">
            <MaterialCommunityIcons name="close-circle" size={18} color="#94a3b8" />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  const chipsRow = (
    <View style={styles.chipsBar}>
      <FlatList
        ref={chipListRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterRow}
        contentContainerStyle={[styles.filterRowContent, { paddingHorizontal: pad, paddingRight: isDesktop ? 64 : pad + 8 }]}
        data={chipItems}
        keyExtractor={(item) => item}
        onScroll={onChipScroll}
        onContentSizeChange={(w) => setChipScroll((prev) => ({ ...prev, contentWidth: w }))}
        onLayout={(e) => {
          const viewportWidth = e.nativeEvent.layout.width;
          setChipScroll((prev) => ({ ...prev, viewportWidth }));
        }}
        scrollEventThrottle={32}
        renderItem={({ item }) => renderChip(item)}
      />
      {isDesktop && canScrollChipsBack && (
        <TouchableOpacity
          style={[styles.chipArrow, { left: pad - 8 }]}
          onPress={() => scrollChips(-1)}
          accessibilityLabel="Scroll categories left"
        >
          <MaterialCommunityIcons name="chevron-left" size={22} color={colors.ink} />
        </TouchableOpacity>
      )}
      {isDesktop && canScrollChipsForward && (
        <TouchableOpacity
          style={[styles.chipArrow, { right: pad - 8 }]}
          onPress={() => scrollChips(1)}
          accessibilityLabel="Scroll categories right"
        >
          <MaterialCommunityIcons name="chevron-right" size={22} color={colors.ink} />
        </TouchableOpacity>
      )}
    </View>
  );

  const allTripsHeader = (
    <View style={[styles.allTripsHeader, { paddingHorizontal: pad }]}>
      <View style={styles.allTripsTitleRow}>
        <MaterialCommunityIcons name="format-list-bulleted" size={22} color={colors.ink} />
        <Text style={styles.allTripsTitle}>
          All Trips{data ? ` (${data.total})` : ""}
        </Text>
        {isFetching && !isLoading && <ActivityIndicator size="small" color={colors.primary} />}
      </View>
      <View style={styles.allTripsControls}>
        <ViewModeToggle options={VIEW_OPTIONS} value={activeView} onChange={onViewChange} size="compact" />
        <View style={styles.sortGroup}>
          <Text style={styles.sortLabel}>Sort by</Text>
          <ViewModeToggle options={SORT_OPTIONS} value={sortOrder} onChange={setSortOrder} size="compact" />
        </View>
      </View>
    </View>
  );

  const skeletonCells = Array.from({ length: Math.max(rowSize, 1) });

  return (
    <View style={styles.container}>
      <FlatList
        style={styles.list}
        contentContainerStyle={styles.listContent}
        data={rows}
        keyExtractor={(row) => row.map((t) => t.id).join("-")}
        refreshControl={
          <RefreshControl
            refreshing={isFetching}
            onRefresh={() => queryClient.invalidateQueries({ queryKey: ["trips"] })}
          />
        }
        ListHeaderComponent={
          <>
            {hero}
            {chipsRow}

            <DiscoverSection
              title="Featured Trips"
              subtitle="Handpicked trips you might love"
              icon="fire"
              iconColor="#f97316"
              trips={featuredTrips}
              isLoading={trendingLoading || (!trendingTrips?.length && isLoading)}
              onTripPress={onSectionTripPress}
              cardWidth={sectionCardWidth}
              horizontalPadding={pad}
            />
            <DiscoverSection
              title="Recommended For You"
              subtitle="Picked for your travel style"
              icon="star-four-points"
              trips={recommendedTrips}
              isLoading={recommendedLoading}
              onTripPress={onSectionTripPress}
              cardWidth={sectionCardWidth}
              horizontalPadding={pad}
            />
            <DiscoverSection
              title="Near You"
              subtitle={`Trips within ${DEFAULT_RADIUS_KM} km`}
              icon="map-marker-radius"
              iconColor={colors.danger}
              trips={nearYouData?.items}
              isLoading={!!nearYouCoords && nearYouLoading}
              onTripPress={onSectionTripPress}
              cardWidth={sectionCardWidth}
              horizontalPadding={pad}
            />
            <DiscoverSection
              title="This Weekend"
              subtitle="Trips starting this weekend"
              icon="calendar-star"
              trips={weekendData?.items}
              isLoading={weekendLoading}
              onTripPress={onSectionTripPress}
              cardWidth={sectionCardWidth}
              horizontalPadding={pad}
            />

            {(buddiesLoading || (buddyMatches?.items.length ?? 0) > 0) && (
              <View style={styles.section}>
                <View style={[styles.sectionHeaderRow, { paddingHorizontal: pad }]}>
                  <View style={styles.sectionTitleRow}>
                    <MaterialCommunityIcons name="account-group" size={20} color={colors.primary} />
                    <Text style={styles.sectionTitle}>Travel Buddies</Text>
                  </View>
                  <TouchableOpacity style={styles.seeAllButton} onPress={() => navigation.navigate("TravelBuddies")}>
                    <Text style={styles.seeAllLink}>See All</Text>
                    <MaterialCommunityIcons name="chevron-right" size={16} color={colors.primary} />
                  </TouchableOpacity>
                </View>
                <FlatList
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={[styles.buddyRow, { paddingHorizontal: pad }]}
                  data={buddiesLoading ? [] : buddyMatches?.items}
                  keyExtractor={(item) => item.id}
                  ListEmptyComponent={
                    buddiesLoading ? (
                      <View style={styles.buddyRow}>
                        <BuddyCardSkeleton />
                        <BuddyCardSkeleton />
                      </View>
                    ) : null
                  }
                  renderItem={({ item }) => (
                    <BuddyCard
                      buddy={item}
                      onViewProfile={() => navigation.navigate("UserProfile", { userId: item.id })}
                      onConnect={() => onConnectBuddy(item.id)}
                      onRespond={() => navigation.navigate("ConnectionRequests")}
                    />
                  )}
                />
              </View>
            )}

            {allTripsHeader}

            {viewMode === "map" && (
              <View style={[styles.mapSection, { paddingHorizontal: pad }]}>
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
                <View style={[styles.mapAreaWrap, { height: Math.max(360, windowHeight * 0.6) }]}>
                  <ExploreMap
                    pins={mapPins}
                    userLocation={mapUserLocation}
                    panTarget={panTarget}
                    onMarkerPress={setPreviewTripId}
                  />
                  {mapLoading && (
                    <View style={styles.mapLoadingOverlay} pointerEvents="none">
                      <ActivityIndicator color={colors.primary} />
                    </View>
                  )}
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

            {viewMode === "list" && isLoading && (
              <>
                {[0, 1].map((r) => (
                  <View key={r} style={[styles.gridRow, { paddingHorizontal: pad }]}>
                    {skeletonCells.map((_, c) => (
                      <View key={c} style={styles.gridCell}>
                        <TripCardSkeleton layout={viewLayout} />
                      </View>
                    ))}
                  </View>
                ))}
              </>
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
        renderItem={({ item: row }) =>
          isLoading ? null : (
            <Animated.View style={[styles.gridRow, { paddingHorizontal: pad, opacity: fadeAnim }]}>
              {row.map((trip) => (
                <View key={trip.id} style={styles.gridCell}>
                  <TripCard
                    trip={trip}
                    layout={viewLayout}
                    onPress={() => navigation.navigate("TripDetail", { tripId: trip.id })}
                  />
                </View>
              ))}
              {Array.from({ length: rowSize - row.length }).map((_, i) => (
                <View key={`filler-${i}`} style={styles.gridCell} />
              ))}
            </Animated.View>
          )
        }
      />

      <TouchableOpacity
        style={[styles.fab, { right: pad + 4 }]}
        onPress={() => navigation.navigate("CreateTrip")}
        activeOpacity={0.9}
      >
        <MaterialCommunityIcons name="plus" size={20} color={colors.white} />
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
    list: { flex: 1 },
    listContent: { width: "100%", maxWidth: CONTENT_MAX_WIDTH, alignSelf: "center", paddingBottom: 110 },
    hero: {
      overflow: "hidden",
      paddingBottom: 26,
      borderBottomLeftRadius: 24,
      borderBottomRightRadius: 24,
      backgroundColor: "#0c2b28",
    },
    heroDesktop: { minHeight: 280, paddingBottom: 40 },
    heroPhoto: { position: "absolute", left: 0, right: 0, width: "100%" },
    heroTagline: {
      position: "absolute",
      right: 40,
      bottom: 28,
      color: "#ffffff",
      fontSize: 26,
      lineHeight: 30,
      fontStyle: "italic",
      fontWeight: "600",
      textAlign: "right",
      transform: [{ rotate: "-8deg" }],
      textShadowColor: "rgba(0,0,0,0.35)",
      textShadowRadius: 8,
    },
    heroTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 },
    heroTitleBlock: { flex: 1, minWidth: 0 },
    heroKicker: { color: "rgba(255,255,255,0.9)", fontSize: 14, fontWeight: "600", marginBottom: 2 },
    heroTitle: { color: "#ffffff", fontSize: 30, fontWeight: "800", letterSpacing: -0.5 },
    heroTitleDesktop: { fontSize: 42 },
    heroSubtitle: { color: "rgba(255,255,255,0.92)", fontSize: 14, marginTop: 6, lineHeight: 20, maxWidth: 560 },
    heroActions: { flexDirection: "row", alignItems: "center", gap: 12 },
    heroIconButton: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: "rgba(255,255,255,0.92)",
      alignItems: "center",
      justifyContent: "center",
    },
    greeting: { fontSize: 15, fontWeight: "700", color: "#ffffff" },
    greetingSub: { fontSize: 12.5, color: "rgba(255,255,255,0.85)", marginTop: 2 },
    avatar: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: "rgba(255,255,255,0.9)" },
    avatarPlaceholder: { backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
    avatarInitial: { color: colors.white, fontWeight: "700", fontSize: 16 },
    searchWrap: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginTop: 18,
      backgroundColor: "#ffffff",
      borderRadius: RADIUS.pill,
      paddingHorizontal: 18,
      shadowColor: "#0f172a",
      shadowOpacity: 0.15,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: 3,
    },
    searchWrapDesktop: { maxWidth: 460, marginTop: 24 },
    search: { flex: 1, minWidth: 0, paddingVertical: 13, fontSize: 14.5, color: "#0f172a" },
    chipsBar: { position: "relative", marginTop: 16 },
    filterRow: { flexGrow: 0 },
    filterRowContent: { paddingVertical: 4, alignItems: "center", gap: 10 },
    chipArrow: {
      position: "absolute",
      top: 4,
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: colors.ink,
      shadowOpacity: 0.12,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 },
      elevation: 3,
    },
    chip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
      justifyContent: "center",
      minHeight: 40,
      backgroundColor: colors.surfaceElevated,
      borderRadius: RADIUS.pill,
      paddingHorizontal: 16,
      paddingVertical: 9,
      borderWidth: 1,
      borderColor: colors.border,
    },
    chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { fontSize: 13, color: colors.ink, fontWeight: "500", includeFontPadding: false },
    chipTextActive: { color: colors.white, fontWeight: "700" },
    chipRemoveButton: { marginLeft: -2 },
    clearAllChip: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 4,
      minHeight: 40,
      backgroundColor: colors.dangerBg,
      borderRadius: RADIUS.pill,
      paddingHorizontal: 14,
      paddingVertical: 9,
      borderWidth: 1,
      borderColor: colors.dangerBorderLight,
    },
    clearAllChipText: { fontSize: 13, color: colors.danger, fontWeight: "700", includeFontPadding: false },
    section: { marginTop: 24 },
    sectionHeaderRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 12,
    },
    sectionTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    sectionTitle: { fontSize: 18, fontWeight: "700", color: colors.ink },
    seeAllButton: { flexDirection: "row", alignItems: "center", gap: 2 },
    seeAllLink: { fontSize: 13.5, fontWeight: "700", color: colors.primary },
    buddyRow: { flexDirection: "row", gap: 12 },
    allTripsHeader: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      marginTop: 32,
      marginBottom: 16,
    },
    allTripsTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    allTripsTitle: { fontSize: 20, fontWeight: "700", color: colors.ink },
    allTripsControls: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 12, flexShrink: 1, maxWidth: "100%" },
    sortGroup: { flexDirection: "row", alignItems: "center", gap: 8 },
    sortLabel: { fontSize: 12.5, color: colors.muted, fontWeight: "600" },
    mapSection: { marginBottom: 8 },
    trendingChipsRow: { minHeight: 40, flexGrow: 0, marginBottom: 10 },
    trendingChipsRowContent: { gap: 8, alignItems: "center" },
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
      borderRadius: 16,
      overflow: "hidden",
      position: "relative",
      borderWidth: 1,
      borderColor: colors.border,
    },
    mapLoadingOverlay: { position: "absolute", top: 12, right: 12 },
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
    gridRow: { flexDirection: "row", gap: 16 },
    gridCell: { flex: 1, minWidth: 0 },
    emptyWrap: { alignItems: "center", marginTop: 32, gap: 10, paddingHorizontal: 16 },
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
      bottom: 20,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: "#2563eb",
      borderRadius: RADIUS.pill,
      paddingVertical: 14,
      paddingHorizontal: 22,
      shadowColor: "#1d4ed8",
      shadowOpacity: 0.35,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 6 },
      elevation: 6,
    },
    fabText: { color: colors.white, fontWeight: "700", fontSize: 14.5 },
  });
}
