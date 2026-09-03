import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import * as Location from "expo-location";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { CompositeScreenProps } from "@react-navigation/native";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { AppStackParamList, AppTabParamList } from "../navigation/types";
import { useTrips } from "../api/trips";
import { useMe } from "../api/users";
import { TRAVEL_MODES, TRAVEL_MODE_LABELS, type TravelMode, type Trip } from "../types";
import { TripCard } from "../components/TripCard";

type Props = CompositeScreenProps<
  BottomTabScreenProps<AppTabParamList, "Discover">,
  NativeStackScreenProps<AppStackParamList>
>;

type CategoryTab = "ALL" | "RECOMMENDED" | "NEARBY" | "POPULAR";

const CATEGORY_TABS: { key: CategoryTab; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "RECOMMENDED", label: "Recommended" },
  { key: "NEARBY", label: "Nearby Trips" },
  { key: "POPULAR", label: "Popular" },
];

function applyCategory(trips: Trip[], category: CategoryTab, preferredModes: TravelMode[]): Trip[] {
  if (category === "RECOMMENDED" && preferredModes.length > 0) {
    return trips.filter((trip) => preferredModes.includes(trip.travelMode));
  }
  if (category === "POPULAR") {
    return [...trips].sort(
      (a, b) => b._count.likes + b._count.comments - (a._count.likes + a._count.comments)
    );
  }
  return trips;
}

export function DiscoverScreen({ navigation }: Props) {
  const [search, setSearch] = useState("");
  const [travelMode, setTravelMode] = useState<TravelMode | undefined>();
  const [nearMe, setNearMe] = useState<{ lat: number; lng: number } | null>(null);
  const [category, setCategory] = useState<CategoryTab>("ALL");

  const { data: me } = useMe();

  const { data, isLoading, isFetching, refetch } = useTrips({
    search: search || undefined,
    travelMode,
    lat: nearMe?.lat,
    lng: nearMe?.lng,
    radiusKm: nearMe ? 200 : undefined,
  });

  const trips = useMemo(
    () => applyCategory(data?.items ?? [], category, me?.preferredModes ?? []),
    [data?.items, category, me?.preferredModes]
  );

  const toggleNearMe = async () => {
    if (nearMe) {
      setNearMe(null);
      return;
    }
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") return;
    const position = await Location.getCurrentPositionAsync({});
    setNearMe({ lat: position.coords.latitude, lng: position.coords.longitude });
  };

  const selectCategory = async (key: CategoryTab) => {
    setCategory(key);
    if (key === "NEARBY" && !nearMe) {
      await toggleNearMe();
    } else if (key !== "NEARBY" && nearMe) {
      setNearMe(null);
    }
  };

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.search}
        placeholder="Search trips, destinations..."
        value={search}
        onChangeText={setSearch}
      />

      <View style={styles.categoryRow}>
        {CATEGORY_TABS.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.categoryTab, category === tab.key && styles.categoryTabActive]}
            onPress={() => selectCategory(tab.key)}
          >
            <Text style={[styles.categoryTabText, category === tab.key && styles.categoryTabTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterRow}
        data={["NEAR_ME" as const, ...TRAVEL_MODES]}
        keyExtractor={(item) => item}
        renderItem={({ item }) =>
          item === "NEAR_ME" ? (
            <TouchableOpacity
              style={[styles.chip, nearMe && styles.chipActive]}
              onPress={toggleNearMe}
            >
              <Text style={[styles.chipText, nearMe && styles.chipTextActive]}>📍 Near me</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.chip, travelMode === item && styles.chipActive]}
              onPress={() => setTravelMode(travelMode === item ? undefined : item)}
            >
              <Text style={[styles.chipText, travelMode === item && styles.chipTextActive]}>
                {TRAVEL_MODE_LABELS[item]}
              </Text>
            </TouchableOpacity>
          )
        }
      />

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} size="large" />
      ) : (
        <FlatList
          contentContainerStyle={styles.list}
          data={trips}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} />}
          ListEmptyComponent={<Text style={styles.empty}>No trips match yet — try widening your filters.</Text>}
          renderItem={({ item }) => (
            <TripCard trip={item} onPress={() => navigation.navigate("TripDetail", { tripId: item.id })} />
          )}
        />
      )}

      <TouchableOpacity style={styles.fab} onPress={() => navigation.navigate("CreateTrip")}>
        <Text style={styles.fabText}>+ Create Trip</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc" },
  search: {
    margin: 12,
    marginBottom: 4,
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 12,
  },
  categoryRow: {
    flexDirection: "row",
    paddingHorizontal: 12,
    marginTop: 10,
    marginBottom: 4,
    gap: 8,
  },
  categoryTab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  categoryTabActive: { backgroundColor: "#0f766e", borderColor: "#0f766e" },
  categoryTabText: { fontSize: 12, fontWeight: "600", color: "#64748b" },
  categoryTabTextActive: { color: "#fff" },
  filterRow: { paddingHorizontal: 12, marginVertical: 8, flexGrow: 0 },
  chip: {
    backgroundColor: "#fff",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  chipActive: { backgroundColor: "#0f766e", borderColor: "#0f766e" },
  chipText: { fontSize: 12, color: "#334155" },
  chipTextActive: { color: "#fff", fontWeight: "600" },
  list: { padding: 12, paddingBottom: 90 },
  empty: { textAlign: "center", color: "#94a3b8", marginTop: 40 },
  fab: {
    position: "absolute",
    right: 16,
    bottom: 16,
    backgroundColor: "#0f766e",
    borderRadius: 999,
    paddingVertical: 14,
    paddingHorizontal: 20,
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 6,
  },
  fabText: { color: "#fff", fontWeight: "700" },
});
