import { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
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
import { TRAVEL_MODES, TRAVEL_MODE_LABELS, type TravelMode } from "../types";
import { TripCard } from "../components/TripCard";

type Props = CompositeScreenProps<
  BottomTabScreenProps<AppTabParamList, "Discover">,
  NativeStackScreenProps<AppStackParamList>
>;

export function DiscoverScreen({ navigation }: Props) {
  const [search, setSearch] = useState("");
  const [travelMode, setTravelMode] = useState<TravelMode | undefined>();
  const [nearMe, setNearMe] = useState<{ lat: number; lng: number } | null>(null);

  const { data: me } = useMe();

  const { data, isLoading, isFetching, refetch } = useTrips({
    search: search || undefined,
    travelMode,
    lat: nearMe?.lat,
    lng: nearMe?.lng,
    radiusKm: nearMe ? 200 : undefined,
  });

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

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Hi, {me?.name?.split(" ")[0] ?? "there"} 👋</Text>
          <Text style={styles.greetingSub}>Where to next?</Text>
        </View>
        <TouchableOpacity onPress={() => navigation.navigate("Profile")}>
          {me?.photoUrl ? (
            <Image source={{ uri: me.photoUrl }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder]}>
              <Text style={styles.avatarInitial}>{(me?.name ?? "?").charAt(0).toUpperCase()}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <TextInput
        style={styles.search}
        placeholder="Search trips, destinations..."
        value={search}
        onChangeText={setSearch}
      />

      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterRow}
        contentContainerStyle={styles.filterRowContent}
        data={["NEAR_ME" as const, ...TRAVEL_MODES]}
        keyExtractor={(item) => item}
        renderItem={({ item }) => {
          if (item === "NEAR_ME") {
            return (
              <TouchableOpacity style={[styles.chip, nearMe && styles.chipActive]} onPress={toggleNearMe}>
                <Text style={[styles.chipText, nearMe && styles.chipTextActive]}>📍 Near me</Text>
              </TouchableOpacity>
            );
          }
          const active = travelMode === item;
          return (
            <TouchableOpacity
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => setTravelMode(active ? undefined : item)}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{TRAVEL_MODE_LABELS[item]}</Text>
            </TouchableOpacity>
          );
        }}
      />

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} size="large" />
      ) : (
        <FlatList
          contentContainerStyle={styles.list}
          data={data?.items ?? []}
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
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  greeting: { fontSize: 20, fontWeight: "700", color: "#0f172a" },
  greetingSub: { fontSize: 13, color: "#64748b", marginTop: 2 },
  avatar: { width: 42, height: 42, borderRadius: 21 },
  avatarPlaceholder: { backgroundColor: "#0f766e", alignItems: "center", justifyContent: "center" },
  avatarInitial: { color: "#fff", fontWeight: "700", fontSize: 16 },
  search: {
    margin: 12,
    marginBottom: 4,
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 12,
  },
  filterRow: { marginVertical: 8, flexGrow: 0 },
  filterRowContent: { paddingHorizontal: 12, alignItems: "center" },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  chipActive: { backgroundColor: "#0f766e", borderColor: "#0f766e" },
  chipText: { fontSize: 12, lineHeight: 16, color: "#334155" },
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
