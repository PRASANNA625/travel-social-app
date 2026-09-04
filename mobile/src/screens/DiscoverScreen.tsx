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
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { CompositeScreenProps } from "@react-navigation/native";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { AppStackParamList, AppTabParamList } from "../navigation/types";
import { useTrips } from "../api/trips";
import { useMe } from "../api/users";
import { TRAVEL_MODES, type TravelMode } from "../types";
import { TripCard } from "../components/TripCard";
import { TRAVEL_MODE_ICONS, travelModeText } from "../utils/travelModeIcons";

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

      <View style={styles.searchWrap}>
        <MaterialCommunityIcons name="magnify" size={18} color="#94a3b8" />
        <TextInput
          style={styles.search}
          placeholder="Search trips, destinations..."
          placeholderTextColor="#94a3b8"
          value={search}
          onChangeText={setSearch}
        />
      </View>

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
                <MaterialCommunityIcons name="map-marker" size={15} color={nearMe ? "#fff" : "#334155"} />
                <Text style={[styles.chipText, nearMe && styles.chipTextActive]}>Near me</Text>
              </TouchableOpacity>
            );
          }
          const active = travelMode === item;
          return (
            <TouchableOpacity
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => setTravelMode(active ? undefined : item)}
            >
              <MaterialCommunityIcons
                name={TRAVEL_MODE_ICONS[item]}
                size={15}
                color={active ? "#fff" : "#334155"}
              />
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{travelModeText(item)}</Text>
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
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <MaterialCommunityIcons name="compass-outline" size={40} color="#cbd5e1" />
              <Text style={styles.empty}>No trips match yet — try widening your filters.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <TripCard trip={item} onPress={() => navigation.navigate("TripDetail", { tripId: item.id })} />
          )}
        />
      )}

      <TouchableOpacity style={styles.fab} onPress={() => navigation.navigate("CreateTrip")} activeOpacity={0.9}>
        <MaterialCommunityIcons name="plus" size={18} color="#fff" />
        <Text style={styles.fabText}>Create Trip</Text>
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
    paddingTop: 16,
  },
  greeting: { fontSize: 21, fontWeight: "700", color: "#0f172a" },
  greetingSub: { fontSize: 13, color: "#64748b", marginTop: 2 },
  avatar: { width: 42, height: 42, borderRadius: 21 },
  avatarPlaceholder: { backgroundColor: "#0f766e", alignItems: "center", justifyContent: "center" },
  avatarInitial: { color: "#fff", fontWeight: "700", fontSize: 16 },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 14,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    paddingHorizontal: 14,
  },
  search: { flex: 1, paddingVertical: 12, fontSize: 14, color: "#0f172a" },
  filterRow: { marginTop: 14, marginBottom: 6, flexGrow: 0 },
  filterRowContent: { paddingHorizontal: 16, paddingRight: 24, alignItems: "center", gap: 8 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    justifyContent: "center",
    backgroundColor: "#fff",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  chipActive: { backgroundColor: "#0f766e", borderColor: "#0f766e" },
  chipText: { fontSize: 12.5, color: "#334155", fontWeight: "500" },
  chipTextActive: { color: "#fff", fontWeight: "700" },
  list: { padding: 16, paddingBottom: 100 },
  emptyWrap: { alignItems: "center", marginTop: 48, gap: 10 },
  empty: { textAlign: "center", color: "#94a3b8", fontSize: 13, paddingHorizontal: 32 },
  fab: {
    position: "absolute",
    right: 16,
    bottom: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#0f766e",
    borderRadius: 999,
    paddingVertical: 14,
    paddingHorizontal: 20,
    shadowColor: "#0f172a",
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  fabText: { color: "#fff", fontWeight: "700", fontSize: 14 },
});
