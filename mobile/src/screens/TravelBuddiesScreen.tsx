import { useEffect, useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
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

type SortMode = "best" | "newest";

const GRID_GAP = 16;
const LIST_PADDING = 16;
const GRID_MAX_WIDTH = 1440;

// Rendered both as the TravelBuddies stack screen and as the Meetups tab, so it
// takes navigation from the hook rather than screen props.
export function TravelBuddiesScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  // Grid of equal-width cards that fills the screen (sidebar-aware on desktop).
  const { contentWidth } = useResponsiveLayout();
  const gridWidth = Math.min(contentWidth, GRID_MAX_WIDTH) - LIST_PADDING * 2;
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
      <View style={styles.searchWrap}>
        <MaterialCommunityIcons name="magnify" size={18} color={colors.mutedLight} />
        <TextInput
          style={styles.search}
          placeholder="Search by name or bio..."
          placeholderTextColor={colors.mutedLight}
          value={search}
          onChangeText={handleSearchChange}
        />
      </View>

      <View style={styles.searchWrap}>
        <MaterialCommunityIcons name="map-marker-outline" size={18} color={colors.mutedLight} />
        <TextInput
          style={styles.search}
          placeholder="Filter by location..."
          placeholderTextColor={colors.mutedLight}
          value={location}
          onChangeText={handleLocationChange}
        />
      </View>

      {pendingRequests && pendingRequests.length > 0 && (
        <TouchableOpacity style={styles.requestsPill} onPress={() => navigation.navigate("ConnectionRequests")}>
          <MaterialCommunityIcons name="account-heart-outline" size={16} color={colors.primary} />
          <Text style={styles.requestsPillText}>Requests ({pendingRequests.length})</Text>
        </TouchableOpacity>
      )}

      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterRow}
        contentContainerStyle={styles.filterRowContent}
        data={["SORT" as const, ...TRAVEL_MODES, ...availableInterests]}
        keyExtractor={(item) => item}
        renderItem={({ item }) => {
          if (item === "SORT") {
            return (
              <TouchableOpacity
                style={styles.chip}
                onPress={() => setSortMode((prev) => (prev === "best" ? "newest" : "best"))}
              >
                <MaterialCommunityIcons
                  name={sortMode === "best" ? "star-outline" : "clock-outline"}
                  size={15}
                  color={colors.ink}
                />
                <Text style={styles.chipText}>{sortMode === "best" ? "Best match" : "Newest"}</Text>
              </TouchableOpacity>
            );
          }
          if ((TRAVEL_MODES as readonly string[]).includes(item)) {
            const mode = item as TravelMode;
            const active = travelMode === mode;
            return (
              <TouchableOpacity
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => handleTravelModeChange(active ? undefined : mode)}
              >
                <MaterialCommunityIcons name={TRAVEL_MODE_ICONS[mode]} size={15} color={active ? colors.white : colors.ink} />
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{travelModeText(mode)}</Text>
              </TouchableOpacity>
            );
          }
          const active = interest === item;
          return (
            <TouchableOpacity
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => handleInterestChange(active ? undefined : item)}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{item}</Text>
            </TouchableOpacity>
          );
        }}
      />

      {isLoading && page === 1 ? (
        <View style={[styles.skeletonGrid, { gap: GRID_GAP }]}>
          {Array.from({ length: Math.max(2, columns) }, (_, i) => (
            <BuddyCardSkeleton key={i} width={cardWidth} />
          ))}
        </View>
      ) : (
        <FlatList
          // numColumns can't change on a mounted FlatList; remount when the column count changes.
          key={`buddies-${columns}`}
          contentContainerStyle={[styles.list, columns === 1 && styles.listSingle]}
          data={displayedItems}
          keyExtractor={(item) => item.id}
          numColumns={columns}
          columnWrapperStyle={columns > 1 ? { gap: GRID_GAP } : undefined}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <MaterialCommunityIcons name="account-search-outline" size={40} color={colors.mutedLight} />
              <Text style={styles.empty}>No travel buddies match yet — try widening your filters.</Text>
            </View>
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
    searchWrap: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginHorizontal: 16,
      marginTop: 12,
      backgroundColor: colors.surfaceElevated,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 14,
    },
    search: { flex: 1, paddingVertical: 12, fontSize: 14, color: colors.ink },
    requestsPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      alignSelf: "flex-start",
      marginHorizontal: 16,
      marginTop: 12,
      backgroundColor: colors.successBg,
      borderRadius: RADIUS.pill,
      paddingHorizontal: 12,
      paddingVertical: 7,
    },
    requestsPillText: { fontSize: 12.5, fontWeight: "700", color: colors.primary },
    filterRow: { minHeight: 46, marginTop: 12, flexGrow: 0 },
    filterRowContent: { paddingHorizontal: 16, paddingRight: 24, paddingVertical: 4, alignItems: "center", gap: 8 },
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
    chipText: { fontSize: 12.5, color: colors.ink, fontWeight: "500" },
    chipTextActive: { color: colors.white, fontWeight: "700" },
    skeletonGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12, padding: 16 },
    list: { padding: LIST_PADDING, paddingBottom: 40, width: "100%", maxWidth: GRID_MAX_WIDTH, alignSelf: "center" },
    listSingle: { alignItems: "center" },
    cardWrap: { marginBottom: 16 },
    emptyWrap: { alignItems: "center", marginTop: 48, gap: 10, paddingHorizontal: 32 },
    empty: { textAlign: "center", color: colors.mutedLight, fontSize: 13 },
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
