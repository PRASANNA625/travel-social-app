import { useEffect, useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { AppStackParamList } from "../navigation/types";
import { useBuddyMatches, usePendingBuddyRequests, useSendBuddyRequest } from "../api/buddies";
import { BuddyCard, BUDDY_CARD_WIDTH } from "../components/BuddyCard";
import { useResponsiveLayout } from "../theme/layout";
import { BuddyCardSkeleton } from "../components/BuddyCardSkeleton";
import type { BuddyMatch, TravelMode } from "../types";
import { TRAVEL_MODES } from "../types";
import { TRAVEL_MODE_ICONS, travelModeText } from "../utils/travelModeIcons";
import { RADIUS } from "../theme/tokens";
import { useTheme } from "../theme/ThemeContext";
import type { Palette } from "../theme/palettes";
import { Alert } from "../utils/alert";
import { ScreenHeader } from "../components/theme/ScreenHeader";
import { SearchField } from "../components/theme/SearchField";
import { FilterChip } from "../components/theme/FilterChip";
import { EmptyState } from "../components/theme/EmptyState";
import { pageGutter } from "../theme/tokens";

type SortMode = "best" | "newest";

const GRID_GAP = 16;
const GRID_MAX_WIDTH = 1440;

// Rendered both as the TravelBuddies stack screen and as the Meetups tab, so it
// takes navigation from the hook rather than screen props.
export function TravelBuddiesScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  // Opened from Discover's "See all" it's a stack screen with a back button; as the Meetups tab it isn't.
  const isStackScreen = useRoute().name === "TravelBuddies";
  // Grid of equal-width cards that fills the screen (sidebar-aware on desktop).
  const { contentWidth, isDesktop } = useResponsiveLayout();
  const gutter = pageGutter(isDesktop);
  const gridWidth = Math.min(contentWidth, GRID_MAX_WIDTH) - gutter * 2;
  const wideFilters = gridWidth >= 640;
  const columns = Math.max(1, Math.min(5, Math.floor((gridWidth + GRID_GAP) / (BUDDY_CARD_WIDTH + GRID_GAP))));
  const cardWidth = columns === 1 ? Math.min(gridWidth, 420) : (gridWidth - (columns - 1) * GRID_GAP) / columns;
  const [search, setSearch] = useState("");
  const [interest, setInterest] = useState<string | undefined>(undefined);
  const [travelMode, setTravelMode] = useState<TravelMode | undefined>(undefined);
  const [location, setLocation] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("best");
  const [page, setPage] = useState(1);
  const [allItems, setAllItems] = useState<BuddyMatch[]>([]);
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const filters = useMemo(
    () => ({
      search: search || undefined,
      interest,
      travelMode,
      location: location || undefined,
      page,
      pageSize: 12,
    }),
    [search, interest, travelMode, location, page]
  );

  const { data, isLoading, isFetching } = useBuddyMatches(filters);
  const { data: pendingRequests } = usePendingBuddyRequests();
  const sendBuddyRequest = useSendBuddyRequest();

  const onConnectBuddy = (userId: string) => {
    sendBuddyRequest.mutate(userId, {
      onSuccess: () => Alert.alert("Request sent", "We'll let you know when they respond."),
      onError: (err: any) => Alert.alert("Couldn't send request", err?.response?.data?.error ?? "Please try again."),
    });
  };

  // Reset to page 1 and clear accumulated items in the same tick as the filter
  // change itself (rather than via a useEffect reacting afterward), so `filters`
  // never briefly carries a new filter value paired with a stale page number.
  function resetPagination() {
    setPage(1);
    setAllItems([]);
  }

  function handleSearchChange(value: string) {
    setSearch(value);
    resetPagination();
  }

  function handleLocationChange(value: string) {
    setLocation(value);
    resetPagination();
  }

  function handleTravelModeChange(mode: TravelMode | undefined) {
    setTravelMode(mode);
    resetPagination();
  }

  function handleInterestChange(value: string | undefined) {
    setInterest(value);
    resetPagination();
  }

  useEffect(() => {
    if (!data) return;
    setAllItems((prev) => {
      if (page === 1) return data.items;
      // A refetch of the current page (e.g. triggered by invalidateQueries after
      // sending a buddy request) yields the same items again; dedupe by id so
      // they aren't appended a second time.
      const seenIds = new Set(prev.map((item) => item.id));
      const newItems = data.items.filter((item) => !seenIds.has(item.id));
      return [...prev, ...newItems];
    });
  }, [data, page]);

  const availableInterests = useMemo(() => {
    const set = new Set<string>();
    allItems.forEach((m) => m.interests.forEach((i) => set.add(i)));
    return Array.from(set).slice(0, 12);
  }, [allItems]);

  const displayedItems = useMemo(() => {
    if (sortMode === "newest") {
      return [...allItems].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
    return allItems;
  }, [allItems, sortMode]);

  const hasMore = data ? page * (filters.pageSize ?? 12) < data.total : false;

  return (
    <View style={styles.container}>
      <ScreenHeader
        title={isStackScreen ? "Travel Buddies" : "Meetups"}
        subtitle="Find travelers who share your style and plan trips together"
        showBack={isStackScreen}
        maxWidth={GRID_MAX_WIDTH}
        right={
          pendingRequests && pendingRequests.length > 0 ? (
            <TouchableOpacity
              style={styles.requestsPill}
              onPress={() => navigation.navigate("ConnectionRequests")}
              accessibilityRole="button"
            >
              <MaterialCommunityIcons name="account-heart-outline" size={16} color={colors.primary} />
              <Text style={styles.requestsPillText}>Requests ({pendingRequests.length})</Text>
            </TouchableOpacity>
          ) : undefined
        }
      />

      <View style={[styles.filters, { paddingHorizontal: gutter }, wideFilters && styles.filtersWide]}>
        <SearchField
          value={search}
          onChangeText={handleSearchChange}
          placeholder="Search by name or bio..."
          style={wideFilters && styles.filterField}
        />
        <SearchField
          value={location}
          onChangeText={handleLocationChange}
          placeholder="Filter by location..."
          icon="map-marker-outline"
          style={wideFilters && styles.filterField}
        />
      </View>

      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterRow}
        contentContainerStyle={[styles.filterRowContent, { paddingHorizontal: gutter }]}
        data={["SORT" as const, ...TRAVEL_MODES, ...availableInterests]}
        keyExtractor={(item) => item}
        renderItem={({ item }) => {
          if (item === "SORT") {
            return (
              <FilterChip
                label={sortMode === "best" ? "Best match" : "Newest"}
                icon={sortMode === "best" ? "star-outline" : "clock-outline"}
                active={false}
                onPress={() => setSortMode((prev) => (prev === "best" ? "newest" : "best"))}
              />
            );
          }
          if ((TRAVEL_MODES as readonly string[]).includes(item)) {
            const mode = item as TravelMode;
            const active = travelMode === mode;
            return (
              <FilterChip
                label={travelModeText(mode)}
                icon={TRAVEL_MODE_ICONS[mode]}
                active={active}
                onPress={() => handleTravelModeChange(active ? undefined : mode)}
              />
            );
          }
          const active = interest === item;
          return <FilterChip label={item} active={active} onPress={() => handleInterestChange(active ? undefined : item)} />;
        }}
      />

      {isLoading && page === 1 ? (
        <View style={[styles.skeletonGrid, { gap: GRID_GAP, paddingHorizontal: gutter }]}>
          {Array.from({ length: Math.max(2, columns) }, (_, i) => (
            <BuddyCardSkeleton key={i} width={cardWidth} />
          ))}
        </View>
      ) : (
        <FlatList
          // numColumns can't change on a mounted FlatList; remount when the column count changes.
          key={`buddies-${columns}`}
          contentContainerStyle={[styles.list, { paddingHorizontal: gutter }, columns === 1 && styles.listSingle]}
          data={displayedItems}
          keyExtractor={(item) => item.id}
          numColumns={columns}
          columnWrapperStyle={columns > 1 ? { gap: GRID_GAP } : undefined}
          ListEmptyComponent={
            <EmptyState
              icon="account-search-outline"
              title="No travel buddies found"
              message="Try a different search or widen your filters."
            />
          }
          renderItem={({ item }) => (
            <View style={styles.cardWrap}>
              <BuddyCard
                buddy={item}
                width={cardWidth}
                onViewProfile={() => navigation.navigate("UserProfile", { userId: item.id })}
                onConnect={() => onConnectBuddy(item.id)}
                onRespond={() => navigation.navigate("ConnectionRequests")}
              />
            </View>
          )}
          ListFooterComponent={
            hasMore ? (
              <TouchableOpacity style={styles.loadMoreButton} onPress={() => setPage((p) => p + 1)} disabled={isFetching}>
                <Text style={styles.loadMoreText}>{isFetching ? "Loading..." : "Load more"}</Text>
              </TouchableOpacity>
            ) : null
          }
        />
      )}
    </View>
  );
}

function createStyles(colors: Palette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.surface },
    filters: { gap: 10, width: "100%", maxWidth: GRID_MAX_WIDTH, alignSelf: "center" },
    filtersWide: { flexDirection: "row" },
    filterField: { flex: 1 },
    requestsPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: colors.successBg,
      borderRadius: RADIUS.pill,
      paddingHorizontal: 12,
      paddingVertical: 7,
    },
    requestsPillText: { fontSize: 12.5, fontWeight: "700", color: colors.primary },
    // flexShrink 0: on short screens the grid below would otherwise squash the chips flat.
    filterRow: { flexGrow: 0, flexShrink: 0, marginTop: 12, width: "100%", maxWidth: GRID_MAX_WIDTH, alignSelf: "center" },
    filterRowContent: { paddingVertical: 4, alignItems: "center", gap: 8 },
    skeletonGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12, paddingVertical: 16 },
    list: { paddingTop: 16, paddingBottom: 40, width: "100%", maxWidth: GRID_MAX_WIDTH, alignSelf: "center" },
    listSingle: { alignItems: "center" },
    cardWrap: { marginBottom: 16 },
    loadMoreButton: {
      alignSelf: "center",
      marginTop: 8,
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderRadius: RADIUS.pill,
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.border,
    },
    loadMoreText: { fontSize: 13, fontWeight: "700", color: colors.primary },
  });
}
