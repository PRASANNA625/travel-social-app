import { useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { CompositeScreenProps } from "@react-navigation/native";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AppStackParamList, AppTabParamList } from "../navigation/types";
import { useBookmarkedTrips, useMyTrips } from "../api/trips";
import { TripCard } from "../components/TripCard";

type Props = CompositeScreenProps<
  BottomTabScreenProps<AppTabParamList, "MyTrips">,
  NativeStackScreenProps<AppStackParamList>
>;

export function MyTripsScreen({ navigation }: Props) {
  const [tab, setTab] = useState<"mine" | "saved">("mine");
  const myTrips = useMyTrips();
  const savedTrips = useBookmarkedTrips();

  const data = tab === "mine" ? myTrips.data : savedTrips.data;
  const isLoading = tab === "mine" ? myTrips.isLoading : savedTrips.isLoading;

  return (
    <View style={styles.container}>
      <View style={styles.tabRow}>
        <TouchableOpacity style={[styles.tab, tab === "mine" && styles.tabActive]} onPress={() => setTab("mine")}>
          <Text style={[styles.tabText, tab === "mine" && styles.tabTextActive]}>My Trips</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, tab === "saved" && styles.tabActive]} onPress={() => setTab("saved")}>
          <Text style={[styles.tabText, tab === "saved" && styles.tabTextActive]}>Saved</Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} size="large" />
      ) : (
        <FlatList
          contentContainerStyle={styles.list}
          data={data ?? []}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={
            <Text style={styles.empty}>
              {tab === "mine" ? "You haven't created any trips yet." : "You haven't saved any trips yet."}
            </Text>
          }
          renderItem={({ item }) => (
            <TripCard trip={item} onPress={() => navigation.navigate("TripDetail", { tripId: item.id })} />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc" },
  tabRow: { flexDirection: "row", padding: 12, gap: 8 },
  tab: { flex: 1, padding: 10, borderRadius: 10, backgroundColor: "#fff", alignItems: "center", borderWidth: 1, borderColor: "#e2e8f0" },
  tabActive: { backgroundColor: "#0f766e", borderColor: "#0f766e" },
  tabText: { color: "#334155", fontWeight: "600" },
  tabTextActive: { color: "#fff" },
  list: { padding: 12 },
  empty: { textAlign: "center", color: "#94a3b8", marginTop: 40 },
});
