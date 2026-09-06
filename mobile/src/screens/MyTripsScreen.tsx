import { useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { CompositeScreenProps } from "@react-navigation/native";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AppStackParamList, AppTabParamList } from "../navigation/types";
import { useBookmarkedTrips, useDeleteTrip, useMyTrips } from "../api/trips";
import { TripCard } from "../components/TripCard";
import { TripCardSkeleton } from "../components/TripCardSkeleton";
import type { Trip } from "../types";
import { Alert } from "../utils/alert";
import { useTheme } from "../theme/ThemeContext";
import type { Palette } from "../theme/palettes";

type Props = CompositeScreenProps<
  BottomTabScreenProps<AppTabParamList, "MyTrips">,
  NativeStackScreenProps<AppStackParamList>
>;

export function MyTripsScreen({ navigation }: Props) {
  const [tab, setTab] = useState<"mine" | "saved">("mine");
  const myTrips = useMyTrips();
  const savedTrips = useBookmarkedTrips();
  const deleteTrip = useDeleteTrip();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const data = tab === "mine" ? myTrips.data : savedTrips.data;
  const isLoading = tab === "mine" ? myTrips.isLoading : savedTrips.isLoading;

  const confirmDelete = (trip: Trip) => {
    Alert.alert("Delete this trip?", `"${trip.title}" will be permanently deleted. This can't be undone.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () =>
          deleteTrip.mutate(trip.id, {
            onError: () => Alert.alert("Couldn't delete trip", "Please try again"),
          }),
      },
    ]);
  };

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
        <View style={styles.list}>
          <TripCardSkeleton />
          <TripCardSkeleton />
          <TripCardSkeleton />
        </View>
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
            <TripCard
              trip={item}
              onPress={() => navigation.navigate("TripDetail", { tripId: item.id })}
              onDelete={tab === "mine" ? () => confirmDelete(item) : undefined}
            />
          )}
        />
      )}
    </View>
  );
}

function createStyles(colors: Palette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.surface },
    tabRow: { flexDirection: "row", padding: 12, gap: 8 },
    tab: {
      flex: 1,
      padding: 10,
      borderRadius: 10,
      backgroundColor: colors.surfaceElevated,
      alignItems: "center",
      borderWidth: 1,
      borderColor: colors.border,
    },
    tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    tabText: { color: colors.ink, fontWeight: "600" },
    tabTextActive: { color: colors.white },
    list: { padding: 12 },
    empty: { textAlign: "center", color: colors.mutedLight, marginTop: 40 },
  });
}
