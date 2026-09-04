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
import { TRAVEL_MODE_ICONS, travelModeText } from "../utils/travelModeIcons";
import { getCurrentLocationOrThrow } from "../utils/currentLocation";

type Props = CompositeScreenProps<
  BottomTabScreenProps<AppTabParamList, "Discover">,
  NativeStackScreenProps<AppStackParamList>
>;

const RADIUS_OPTIONS_KM = [10, 25, 50, 100];
const DEFAULT_RADIUS_KM = 50;

export function DiscoverScreen({ navigation }: Props) {
  const [search, setSearch] = useState("");
  const [travelMode, setTravelMode] = useState<TravelMode | undefined>();
  const [nearMe, setNearMe] = useState<{ lat: number; lng: number } | null>(null);
  const [radiusKm, setRadiusKm] = useState(DEFAULT_RADIUS_KM);
  const [locating, setLocating] = useState(false);
  const [radiusSheetVisible, setRadiusSheetVisible] = useState(false);
  const [locationDeniedVisible, setLocationDeniedVisible] = useState(false);

  const { data: me } = useMe();

  const { data, isLoading, isFetching, refetch } = useTrips({
    search: search || undefined,
    travelMode,
    lat: nearMe?.lat,
    lng: nearMe?.lng,
    radiusKm: nearMe ? radiusKm : undefined,
  });

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
              <TouchableOpacity
                style={[styles.chip, nearMe && styles.chipActive]}
                onPress={onNearMePress}
                disabled={locating}
              >
                {locating ? (
                  <ActivityIndicator size="small" color={nearMe ? "#fff" : "#0f766e"} />
                ) : (
                  <MaterialCommunityIcons name="map-marker" size={15} color={nearMe ? "#fff" : "#334155"} />
                )}
                <Text style={[styles.chipText, nearMe && styles.chipTextActive]}>
                  {nearMe ? `Near me · ${radiusKm} km` : "Near me"}
                </Text>
                {nearMe && <MaterialCommunityIcons name="chevron-down" size={14} color="#fff" />}
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
        <MaterialCommunityIcons name="plus" size={18} color="#fff" />
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
              <MaterialCommunityIcons name="close-circle-outline" size={16} color="#dc2626" />
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
              <MaterialCommunityIcons name="map-marker-off-outline" size={26} color="#dc2626" />
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
  filterRow: { height: 46, marginTop: 12, flexGrow: 0 },
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
  list: { padding: 16, paddingBottom: 110 },
  emptyWrap: { alignItems: "center", marginTop: 48, gap: 10 },
  empty: { textAlign: "center", color: "#94a3b8", fontSize: 13, paddingHorizontal: 32 },
  emptyClearLink: { color: "#0f766e", fontSize: 13, fontWeight: "700", marginTop: 2 },
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
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 20,
    shadowColor: "#0f172a",
    shadowOpacity: 0.2,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  sheetTitle: { fontSize: 16, fontWeight: "700", color: "#0f172a", textAlign: "center" },
  sheetSubtitle: { fontSize: 13, color: "#64748b", textAlign: "center", marginTop: 6, lineHeight: 18 },
  radiusOptionsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 16, justifyContent: "center" },
  radiusOption: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
  },
  radiusOptionActive: { backgroundColor: "#0f766e", borderColor: "#0f766e" },
  radiusOptionText: { fontSize: 13, fontWeight: "600", color: "#334155" },
  radiusOptionTextActive: { color: "#fff" },
  clearFilterButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 18,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "#fef2f2",
  },
  clearFilterText: { color: "#dc2626", fontWeight: "700", fontSize: 13 },
  permissionIconWrap: {
    alignSelf: "center",
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#fef2f2",
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
    backgroundColor: "#0f766e",
  },
  permissionRetryText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  fab: {
    position: "absolute",
    right: 16,
    bottom: 20,
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
