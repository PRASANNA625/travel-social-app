import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useIsFocused } from "@react-navigation/native";
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
import { getCurrentLocationOrThrow, locationProblemOf, type LocationProblem } from "../utils/currentLocation";
import { LocationProblemModal } from "../components/LocationProblemModal";
import { LocationPickerModal, type LocationValue } from "../components/LocationPickerModal";
import { HERO_PHOTO, HERO_PHOTO_ASPECT } from "../utils/coverPhotos";
import { DiscoverSection, SECTION_GAP } from "../components/DiscoverSection";
import { SectionHeader } from "../components/SectionHeader";
import { Carousel } from "../components/Carousel";
import { HeroAmbience } from "../components/HeroAmbience";
import { FAB_CLEARANCE, FloatingActionButton } from "../components/theme/FloatingActionButton";
import { hexAlpha } from "../utils/color";
import { useEntrance, useNativeDriver, usePingPong, useReduceMotion } from "../hooks/useReduceMotion";
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
import { CompactBuddyCard, COMPACT_BUDDY_CARD_HEIGHT } from "../components/BuddyCard";
import { useHorizontalScroll } from "../hooks/useHorizontalScroll";
import { CompactBuddyCardSkeleton } from "../components/BuddyCardSkeleton";
import { Alert } from "../utils/alert";
import { useAppConfig } from "../api/config";
import { AnnouncementBanner } from "../components/AnnouncementBanner";
import { SportsDiscover } from "../components/sports/SportsDiscover";
import { DEFAULT_HERO_SETTINGS, useHeroBanners } from "../api/hero";
import { FadeSwap, HeroBackdrop, HeroCopy, HeroDots, HeroTagline, useHeroCarousel } from "../components/hero/HeroCarousel";

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

type DiscoverCategory = "TRAVEL" | "SPORTS";

const CATEGORY_OPTIONS: readonly ViewModeToggleOption<DiscoverCategory>[] = [
  { value: "TRAVEL", icon: "airplane", label: "Travel" },
  { value: "SPORTS", icon: "trophy-outline", label: "Sports & Activities" },
];

const SORT_OPTIONS: readonly ViewModeToggleOption<"asc" | "desc">[] = [
  { value: "asc", icon: "sort-calendar-ascending", label: "Soonest" },
  { value: "desc", icon: "sort-calendar-descending", label: "Latest" },
];

// Eases the hover/press change on web; ignored on native.
const HERO_BUTTON_TRANSITION =
  Platform.OS === "web"
    ? ({ transitionProperty: "transform, box-shadow, opacity", transitionDuration: "180ms" } as object)
    : null;

const VIEW_LAYOUT_STORAGE_KEY = "discover_view_layout";
const CHIP_SCROLL_STEP = 360;

export function DiscoverScreen({ navigation }: Props) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<DiscoverCategory>("TRAVEL");
  const sportsMode = category === "SPORTS";
  const [travelModes, setTravelModes] = useState<TravelMode[]>([]);
  const [nearMe, setNearMe] = useState<{ lat: number; lng: number } | null>(null);
  const [radiusKm, setRadiusKm] = useState(DEFAULT_RADIUS_KM);
  const [locating, setLocating] = useState(false);
  const [radiusSheetVisible, setRadiusSheetVisible] = useState(false);
  const [locationProblem, setLocationProblem] = useState<LocationProblem | null>(null);
  const [placePickerOpen, setPlacePickerOpen] = useState(false);
  // Set when the user picked a place instead of sharing their location.
  const [nearMePlace, setNearMePlace] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [profileMenuVisible, setProfileMenuVisible] = useState(false);
  const [heroSize, setHeroSize] = useState({ width: 0, height: 0 });
  const heroPhotoHeight = Math.max(heroSize.height, heroSize.width / HERO_PHOTO_ASPECT);
  const [profileMenuAnchor, setProfileMenuAnchor] = useState<ProfileMenuAnchor | null>(null);
  const avatarWrapRef = useRef<View>(null);
  const chipScroll = useHorizontalScroll<string>(CHIP_SCROLL_STEP);
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const { isDesktop, contentWidth, height: windowHeight } = useResponsiveLayout();
  const reduceMotion = useReduceMotion();
  const isFocused = useIsFocused();
  const scrollY = useRef(new Animated.Value(0)).current;
  const [fabCollapsed, setFabCollapsed] = useState(false);
  const lastScrollY = useRef(0);
  useEffect(() => {
    const id = scrollY.addListener(({ value }) => {
      const delta = value - lastScrollY.current;
      if (Math.abs(delta) < 8) return;
      lastScrollY.current = value;
      setFabCollapsed(delta > 0 && value > 120);
    });
    return () => scrollY.removeListener(id);
  }, [scrollY]);

  const pad = isDesktop ? 24 : 16;
  const { data: appConfig } = useAppConfig();
  const canCreateTrip = appConfig?.features.tripCreation ?? true;
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
      ? Math.min(innerWidth * 0.84, 340)
      : (innerWidth - (sectionColumns - 1) * SECTION_GAP) / sectionColumns;

  // Compact buddy cards: as many ~240px cards as fit a row on wide screens, a card
  // and a peek of the next on phones.
  const buddiesPerRow = Math.max(1, Math.floor((innerWidth + SECTION_GAP) / (240 + SECTION_GAP)));
  const buddyCardWidth =
    innerWidth < 560
      ? Math.min(innerWidth * 0.8, 300)
      : Math.min(300, (innerWidth - (buddiesPerRow - 1) * SECTION_GAP) / buddiesPerRow);

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
      setNearMePlace(null);
    } catch (err) {
      setLocationProblem(locationProblemOf(err));
    } finally {
      setLocating(false);
    }
  };

  const clearNearMe = () => {
    setNearMe(null);
    setNearMePlace(null);
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

  const firstName = me?.name?.split(" ")[0] ?? "there";

  const chipItems: string[] = [
    "ALL",
    "NEAR_ME",
    ...TRAVEL_MODES.filter((m) => !appConfig?.disabledTravelModes.includes(m)),
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
            {nearMe ? `Near ${nearMePlace ?? "me"} · ${radiusKm} km` : "Near me"}
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

  // Wide screens get the search beside the title and one joined control pill;
  // phones stack them so nothing is squeezed or clipped.
  const wideHeader = innerWidth >= 720;
  const wideControls = innerWidth >= 640;

  // Hero motion: one-time entrance for the text and search, plus a slow ambient
  // scene (drift, clouds, lake, birds) that only runs while Discover is on screen
  // and stops entirely when reduced motion is requested.
  const headingIn = useEntrance(80, reduceMotion);
  const searchIn = useEntrance(260, reduceMotion);
  const taglineIn = [useEntrance(520, reduceMotion, 700), useEntrance(680, reduceMotion, 700), useEntrance(840, reduceMotion, 700)];
  const heroAmbient = isFocused && !reduceMotion;

  // Banners managed from the admin dashboard. With none live, the built-in scene shows.
  const { data: heroData } = useHeroBanners();
  const heroSlides = heroData?.banners ?? [];
  const heroSettings = heroData?.settings ?? DEFAULT_HERO_SETTINGS;
  const [heroPaused, setHeroPaused] = useState(false);
  const [heroIndex, setHeroIndex] = useHeroCarousel(heroSlides.length, heroSettings.intervalSeconds, isFocused && !heroPaused);
  const activeSlide = heroSlides[heroIndex];
  const heroText = activeSlide?.textColor ?? "#ffffff";
  const defaultSubtitle = isDesktop
    ? "Find amazing trips, meet like-minded travelers and create unforgettable memories."
    : "Find trips and meet like-minded travelers.";

  // A banner button opens an in-app place or an https page (new tab on web).
  const openHeroCta = (url: string) => {
    if (url.startsWith("https://")) return void Linking.openURL(url);
    const trip = url.match(/^\/trip\/([a-z0-9]+)$/);
    if (trip) return navigation.navigate("TripDetail", { tripId: trip[1] });
    if (url === "/sports") return setCategory("SPORTS");
    if (url === "/create-trip") return navigation.navigate("CreateTrip");
    if (url === "/create-activity") return navigation.navigate("CreateTrip", { category: "SPORTS" });
    if (url === "/meetups") return navigation.navigate("Meetups");
    if (url === "/my-trips") return navigation.navigate("MyTrips");
  };
  const heroDrift = usePingPong(16000, heroAmbient);
  const heroDriftX = heroDrift.interpolate({ inputRange: [0, 1], outputRange: [-10, 10] });
  const heroParallax = reduceMotion
    ? 0
    : scrollY.interpolate({ inputRange: [0, 400], outputRange: [0, 120], extrapolate: "clamp" });
  // react-native-web adds `hovered` to Pressable's state; native only has `pressed`.
  const heroPressFeedback = (state: { pressed: boolean; hovered?: boolean }) => [
    HERO_BUTTON_TRANSITION,
    state.hovered && !reduceMotion && styles.heroHover,
    state.pressed && styles.heroPressed,
  ];

  const hero = (
    <View
      style={[
        styles.hero,
        { paddingTop: insets.top + (isDesktop ? 32 : 18), paddingHorizontal: isDesktop ? 32 : pad },
        isDesktop && styles.heroDesktop,
      ]}
      onLayout={(e) => setHeroSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
      onPointerEnter={() => setHeroPaused(true)}
      onPointerLeave={() => setHeroPaused(false)}
    >
      {activeSlide ? (
        <HeroBackdrop slides={heroSlides} index={heroIndex} transition={heroSettings.transition} width={heroSize.width} animate={!reduceMotion} />
      ) : (
        <>
        {/* Panorama sized to cover the banner; when the banner is shorter than the photo, crop
            evenly from top and bottom so both the peaks and the lake stay in view. */}
        <Animated.Image
          source={HERO_PHOTO}
          resizeMode="cover"
          style={[
            styles.heroPhoto,
            {
              height: heroPhotoHeight,
              top: (heroSize.height - heroPhotoHeight) / 2,
              transform: [{ translateY: heroParallax }, { translateX: heroDriftX }, { scale: 1.04 }],
            },
          ]}
        />
        <HeroAmbience width={heroSize.width} height={heroSize.height} animate={heroAmbient} />
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
        </>
      )}
      {isDesktop && activeSlide && (
        <FadeSwap id={activeSlide.id} animate={!reduceMotion} style={StyleSheet.absoluteFill}>
          <HeroTagline text={activeSlide.tagline} color={heroText} side="right" />
        </FadeSwap>
      )}
      {isDesktop && !activeSlide && (
        <View style={styles.heroTagline} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {["Explore", "Connect", "Belong"].map((word, i) => (
            <Animated.Text
              key={word}
              style={[
                styles.heroTaglineText,
                {
                  opacity: taglineIn[i],
                  transform: [{ translateY: taglineIn[i].interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
                },
              ]}
            >
              {word}
            </Animated.Text>
          ))}
        </View>
      )}

      <View style={styles.heroTopRow}>
        <Animated.View
          style={[
            styles.heroTitleBlock,
            {
              opacity: headingIn,
              transform: [{ translateY: headingIn.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
            },
          ]}
        >
          {activeSlide ? (
            <FadeSwap id={activeSlide.id} animate={!reduceMotion}>
              <HeroCopy
                slide={{ ...activeSlide, heading: activeSlide.heading ?? "Discover", subtitle: activeSlide.subtitle ?? defaultSubtitle }}
                desktop={isDesktop}
                kicker={isDesktop ? undefined : `Hi, ${firstName} 👋`}
                onCta={() => activeSlide.ctaUrl && openHeroCta(activeSlide.ctaUrl)}
              />
            </FadeSwap>
          ) : (
            <>
              {!isDesktop && <Text style={styles.heroKicker}>Hi, {firstName} 👋</Text>}
              <Text style={[styles.heroTitle, isDesktop && styles.heroTitleDesktop]}>Discover</Text>
              <Text style={styles.heroSubtitle}>{defaultSubtitle}</Text>
            </>
          )}
        </Animated.View>
        <View style={styles.heroActions}>
          <Pressable
            style={(state) => [styles.heroIconButton, heroPressFeedback(state)]}
            onPress={() => navigation.navigate("Settings")}
            accessibilityRole="button"
            accessibilityLabel="Settings"
          >
            <MaterialCommunityIcons name="cog-outline" size={20} color="#0f172a" />
          </Pressable>
          <View ref={avatarWrapRef} collapsable={false}>
            <Pressable
              style={(state) => [styles.heroAvatarButton, heroPressFeedback(state)]}
              onPress={onAvatarPress}
              accessibilityRole="button"
              accessibilityLabel="Profile menu"
            >
              {me?.photoUrl ? (
                <Image source={{ uri: optimizedImageUrl(me.photoUrl, 88) }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarPlaceholder]}>
                  <Text style={styles.avatarInitial}>{(me?.name ?? "?").charAt(0).toUpperCase()}</Text>
                </View>
              )}
            </Pressable>
          </View>
          {isDesktop && (
            <View>
              <Text style={[styles.greeting, { color: heroText }]}>Hi, {firstName} 👋</Text>
              <Text style={[styles.greetingSub, { color: heroText }]}>Where to next?</Text>
            </View>
          )}
        </View>
      </View>

      <Animated.View
        style={[
          styles.searchWrap,
          isDesktop && styles.searchWrapDesktop,
          {
            opacity: searchIn,
            transform: [{ scale: searchIn.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1] }) }],
          },
        ]}
      >
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
      </Animated.View>
      <HeroDots count={heroSlides.length} index={heroIndex} onSelect={setHeroIndex} style={styles.heroDots} />
    </View>
  );

  const chipsRow = (
    <View style={styles.chipsBar}>
      <FlatList
        ref={chipScroll.ref}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterRow}
        contentContainerStyle={[styles.filterRowContent, { paddingHorizontal: pad }]}
        data={chipItems}
        keyExtractor={(item) => item}
        {...chipScroll.listProps}
        renderItem={({ item }) => renderChip(item)}
      />
      {isDesktop && chipScroll.canScrollBack && (
        <View style={[styles.chipEdge, styles.chipEdgeLeft]} pointerEvents="box-none">
          <LinearGradient
            colors={[colors.surface, hexAlpha(colors.surface, 0)]}
            start={{ x: 0.45, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          <TouchableOpacity
            style={[styles.chipArrow, { marginLeft: pad - 8 }]}
            onPress={() => chipScroll.scrollBy(-1)}
            accessibilityLabel="Scroll categories left"
          >
            <MaterialCommunityIcons name="chevron-left" size={20} color={colors.ink} />
          </TouchableOpacity>
        </View>
      )}
      {isDesktop && chipScroll.canScrollForward && (
        <View style={[styles.chipEdge, styles.chipEdgeRight]} pointerEvents="box-none">
          <LinearGradient
            colors={[hexAlpha(colors.surface, 0), colors.surface]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 0.55, y: 0.5 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          <TouchableOpacity
            style={[styles.chipArrow, { marginRight: pad - 8 }]}
            onPress={() => chipScroll.scrollBy(1)}
            accessibilityLabel="Scroll categories right"
          >
            <MaterialCommunityIcons name="chevron-right" size={20} color={colors.ink} />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  const viewToggle = (
    <ViewModeToggle
      options={VIEW_OPTIONS}
      value={activeView}
      onChange={onViewChange}
      size="segmented"
      iconOnly={!wideControls}
    />
  );
  const sortToggle = <ViewModeToggle options={SORT_OPTIONS} value={sortOrder} onChange={setSortOrder} size="segmented" />;
  const tripCountText = data ? `${data.total} trip${data.total === 1 ? "" : "s"}` : undefined;

  const allTripsHeader = (
    <View style={styles.section}>
      <SectionHeader
        title="All Trips"
        meta={isFetching && !isLoading ? "Updating…" : tripCountText}
        horizontalPadding={pad}
        right={
          wideControls ? (
            <View style={styles.controlPill}>
              {viewToggle}
              <View style={styles.controlsDivider} />
              {sortToggle}
            </View>
          ) : undefined
        }
      />
      {!wideControls && (
        <View style={[styles.controlsRow, { paddingHorizontal: pad }]}>
          <View style={styles.controlPill}>{viewToggle}</View>
          <View style={styles.controlPill}>{sortToggle}</View>
        </View>
      )}
    </View>
  );

  const skeletonCells = Array.from({ length: Math.max(rowSize, 1) });

  return (
    <View style={styles.container}>
      <FlatList
        style={styles.list}
        // Plain handler (not Animated.event) so the list's own virtualization keeps
        // receiving scroll events; the value drives the hero parallax and the FAB.
        onScroll={(e) => scrollY.setValue(e.nativeEvent.contentOffset.y)}
        scrollEventThrottle={16}
        contentContainerStyle={styles.listContent}
        data={sportsMode ? [] : rows}
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
            <AnnouncementBanner marginHorizontal={pad} />
            <View style={[styles.categorySwitch, { paddingHorizontal: pad }]}>
              <View style={styles.categorySwitchInner}>
                <ViewModeToggle options={CATEGORY_OPTIONS} value={category} onChange={setCategory} />
              </View>
            </View>

            {sportsMode ? (
              <SportsDiscover
                search={search}
                contentWidth={contentWidth}
                gutter={pad}
                onOpen={(trip) => navigation.navigate("TripDetail", { tripId: trip.id })}
                onCreate={canCreateTrip ? () => navigation.navigate("CreateTrip", { category: "SPORTS" }) : undefined}
                onFindBuddies={() => navigation.navigate("Meetups")}
              />
            ) : (
            <>
            {chipsRow}

            <DiscoverSection
              title="Featured Trips"
              tabs={[
                {
                  key: "featured",
                  label: "Featured",
                  trips: featuredTrips,
                  isLoading: trendingLoading || (!trendingTrips?.length && isLoading),
                },
                { key: "recommended", label: "For you", trips: recommendedTrips, isLoading: recommendedLoading },
                {
                  key: "near",
                  label: `Within ${DEFAULT_RADIUS_KM} km`,
                  trips: nearYouData?.items,
                  isLoading: !!nearYouCoords && nearYouLoading,
                },
                { key: "weekend", label: "This weekend", trips: weekendData?.items, isLoading: weekendLoading },
              ]}
              onTripPress={onSectionTripPress}
              cardWidth={sectionCardWidth}
              horizontalPadding={pad}
              showArrows={isDesktop}
              tabsInline={wideHeader}
            />

            {(buddiesLoading || (buddyMatches?.items.length ?? 0) > 0) && (
              <View style={styles.section}>
                <SectionHeader
                  title="Travel Buddies"
                  meta={wideControls ? "Travelers who share your style" : undefined}
                  horizontalPadding={pad}
                  right={
                    <TouchableOpacity
                      style={styles.seeAll}
                      onPress={() => navigation.navigate("Meetups")}
                      accessibilityRole="link"
                    >
                      <Text style={styles.seeAllText}>See all</Text>
                      <MaterialCommunityIcons name="chevron-right" size={18} color={colors.primary} />
                    </TouchableOpacity>
                  }
                />
                {buddiesLoading ? (
                  <View style={[styles.buddySkeletonRow, { paddingHorizontal: pad }]}>
                    {Array.from({ length: Math.max(2, buddiesPerRow) }, (_, i) => (
                      <CompactBuddyCardSkeleton key={i} width={buddyCardWidth} />
                    ))}
                  </View>
                ) : (
                  <Carousel
                    data={buddyMatches?.items ?? []}
                    keyExtractor={(item) => item.id}
                    renderItem={(item) => (
                      <CompactBuddyCard
                        buddy={item}
                        width={buddyCardWidth}
                        onViewProfile={() => navigation.navigate("UserProfile", { userId: item.id })}
                        onConnect={() => onConnectBuddy(item.id)}
                        onRespond={() => navigation.navigate("ConnectionRequests")}
                      />
                    )}
                    itemWidth={buddyCardWidth}
                    horizontalPadding={pad}
                    showArrows={isDesktop}
                    arrowTop={4 + COMPACT_BUDDY_CARD_HEIGHT / 2}
                    label="travel buddies"
                  />
                )}
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
            )}
          </>
        }
        ListEmptyComponent={
          sportsMode || isLoading || viewMode === "map" ? null : (
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

      {canCreateTrip && (
        <FloatingActionButton
          icon="plus"
          label={sportsMode ? "Create Activity" : "Create Trip"}
          onPress={() => navigation.navigate("CreateTrip", sportsMode ? { category: "SPORTS" } : undefined)}
          collapsed={fabCollapsed}
          right={pad}
        />
      )}

      <Modal
        visible={radiusSheetVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setRadiusSheetVisible(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setRadiusSheetVisible(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.sheetTitle}>{nearMePlace ? `Near ${nearMePlace}` : "Near me"}</Text>
            <Text style={styles.sheetSubtitle}>Showing trips within {radiusKm} km of {nearMePlace ?? "your location"}</Text>
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

      <LocationProblemModal
        problem={locationProblem}
        subject="trips"
        onClose={() => setLocationProblem(null)}
        onRetry={() => {
          setLocationProblem(null);
          activateNearMe();
        }}
        onChoosePlace={() => {
          setLocationProblem(null);
          setPlacePickerOpen(true);
        }}
      />
      <LocationPickerModal
        visible={placePickerOpen}
        title="See trips near"
        initialValue={null}
        onClose={() => setPlacePickerOpen(false)}
        onSelect={(place: LocationValue) => {
          setPlacePickerOpen(false);
          setNearMe({ lat: place.lat, lng: place.lng });
          setNearMePlace(place.name.split(",")[0].trim());
        }}
      />

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
    listContent: { width: "100%", maxWidth: CONTENT_MAX_WIDTH, alignSelf: "center", paddingBottom: FAB_CLEARANCE },
    hero: {
      overflow: "hidden",
      paddingBottom: 26,
      borderBottomLeftRadius: 24,
      borderBottomRightRadius: 24,
      backgroundColor: "#0c2b28",
    },
    heroDesktop: { minHeight: 280, paddingBottom: 40 },
    heroDots: { position: "absolute", bottom: 0, alignSelf: "center" },
    heroPhoto: { position: "absolute", left: 0, right: 0, width: "100%" },
    heroTagline: {
      position: "absolute",
      right: 40,
      bottom: 28,
      alignItems: "flex-end",
      transform: [{ rotate: "-8deg" }],
    },
    heroTaglineText: {
      color: "#ffffff",
      fontSize: 26,
      lineHeight: 30,
      fontStyle: "italic",
      fontWeight: "600",
      textAlign: "right",
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
    heroAvatarButton: { borderRadius: 22 },
    heroHover: {
      transform: [{ translateY: -1 }],
      shadowColor: "#0f172a",
      shadowOpacity: 0.3,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
    },
    heroPressed: { transform: [{ scale: 0.94 }], opacity: 0.9 },
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
    // Edge zones are part of the chip bar, so the arrows can never meet other controls.
    chipEdge: { position: "absolute", top: 0, bottom: 0, width: 72, justifyContent: "center", zIndex: 1 },
    chipEdgeLeft: { left: 0, alignItems: "flex-start" },
    chipEdgeRight: { right: 0, alignItems: "flex-end" },
    filterRow: { flexGrow: 0 },
    filterRowContent: { paddingVertical: 4, alignItems: "center", gap: 8 },
    chipArrow: {
      width: 36,
      height: 36,
      borderRadius: 18,
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
      gap: 6,
      justifyContent: "center",
      height: 36,
      backgroundColor: colors.surfaceElevated,
      borderRadius: RADIUS.pill,
      paddingHorizontal: 14,
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
      height: 36,
      backgroundColor: colors.dangerBg,
      borderRadius: RADIUS.pill,
      paddingHorizontal: 14,
      borderWidth: 1,
      borderColor: colors.dangerBorderLight,
    },
    clearAllChipText: { fontSize: 13, color: colors.danger, fontWeight: "700", includeFontPadding: false },
    section: { marginTop: 28 },
    categorySwitch: { marginTop: 18, alignItems: "flex-start" },
    categorySwitchInner: { width: "100%", maxWidth: 420 },
    seeAll: { flexDirection: "row", alignItems: "center", gap: 2, height: 32, paddingLeft: 8 },
    seeAllText: { fontSize: 13.5, fontWeight: "700", color: colors.primary },
    buddySkeletonRow: { flexDirection: "row", gap: SECTION_GAP, paddingVertical: 4 },
    controlsRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 14 },
    controlPill: {
      flexDirection: "row",
      alignItems: "center",
      padding: 3,
      borderRadius: RADIUS.pill,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceElevated,
    },
    controlsDivider: { width: 1, height: 22, backgroundColor: colors.border, marginHorizontal: 6 },
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
  });
}
