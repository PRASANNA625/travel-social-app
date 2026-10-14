import { useMemo, useState } from "react";
import { FlatList, StyleSheet, View } from "react-native";
import type { CompositeScreenProps } from "@react-navigation/native";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AppStackParamList, AppTabParamList } from "../navigation/types";
import { useBookmarkedTrips, useDeleteTrip, useMyTrips } from "../api/trips";
import { TripCard } from "../components/TripCard";
import { TripCardSkeleton } from "../components/TripCardSkeleton";
import { ScreenHeader } from "../components/theme/ScreenHeader";
import { FilterChip } from "../components/theme/FilterChip";
import { EmptyState } from "../components/theme/EmptyState";
import { FAB_CLEARANCE, FloatingActionButton } from "../components/theme/FloatingActionButton";
import type { Trip } from "../types";
import { Alert } from "../utils/alert";
import { useTheme } from "../theme/ThemeContext";
import type { Palette } from "../theme/palettes";
import { CONTENT_MAX_WIDTH, gridColumnsFor, toRows, useResponsiveLayout } from "../theme/layout";
import { pageGutter } from "../theme/tokens";

type Props = CompositeScreenProps<
  BottomTabScreenProps<AppTabParamList, "MyTrips">,
  NativeStackScreenProps<AppStackParamList>
>;

const GRID_GAP = 16;

export function MyTripsScreen({ navigation }: Props) {
  const [tab, setTab] = useState<"mine" | "saved">("mine");
  const myTrips = useMyTrips();
  const savedTrips = useBookmarkedTrips();
  const deleteTrip = useDeleteTrip();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { isDesktop, contentWidth } = useResponsiveLayout();
  const gutter = pageGutter(isDesktop);
  const columns = gridColumnsFor(contentWidth);

  const data = tab === "mine" ? myTrips.data : savedTrips.data;
  const isLoading = tab === "mine" ? myTrips.isLoading : savedTrips.isLoading;
  const rows = useMemo(() => toRows(data ?? [], columns), [data, columns]);

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

  const countLabel = (label: string, count: number | undefined) => (count ? `${label} · ${count}` : label);

  return (
    <View style={styles.container}>
      <FlatList
        contentContainerStyle={[styles.content, { paddingHorizontal: gutter }]}
        data={isLoading ? [] : rows}
        keyExtractor={(row) => row.map((t) => t.id).join("-")}
        ListHeaderComponent={
          <View style={{ marginHorizontal: -gutter }}>
            <ScreenHeader title="My Trips" subtitle="Trips you organize and trips you've saved" />
            <View style={[styles.tabs, { paddingHorizontal: gutter }]}>
              <FilterChip
                label={countLabel("Created", myTrips.data?.length)}
                icon="bag-personal-outline"
                active={tab === "mine"}
                onPress={() => setTab("mine")}
              />
              <FilterChip
                label={countLabel("Saved", savedTrips.data?.length)}
                icon="bookmark-outline"
                active={tab === "saved"}
                onPress={() => setTab("saved")}
              />
            </View>
            {isLoading && (
              <View style={[styles.row, { paddingHorizontal: gutter }]}>
                {Array.from({ length: columns }, (_, i) => (
                  <View key={i} style={styles.cell}>
                    <TripCardSkeleton />
                  </View>
                ))}
              </View>
            )}
          </View>
        }
        ListEmptyComponent={
          isLoading ? null : tab === "mine" ? (
            <EmptyState
              icon="map-marker-path"
              title="No trips yet"
              message="Plan a trip and find travel buddies to share it with."
              actionLabel="Create a trip"
              onAction={() => navigation.navigate("CreateTrip")}
            />
          ) : (
            <EmptyState
              icon="bookmark-outline"
              title="No saved trips"
              message="Tap Save on any trip to keep it here for later."
              actionLabel="Discover trips"
              onAction={() => navigation.navigate("Discover")}
            />
          )
        }
        renderItem={({ item: row }) => (
          <View style={styles.row}>
            {row.map((trip) => (
              <View key={trip.id} style={styles.cell}>
                <TripCard
                  trip={trip}
                  onPress={() => navigation.navigate("TripDetail", { tripId: trip.id })}
                  onDelete={tab === "mine" ? () => confirmDelete(trip) : undefined}
                />
              </View>
            ))}
            {Array.from({ length: columns - row.length }, (_, i) => (
              <View key={`filler-${i}`} style={styles.cell} />
            ))}
          </View>
        )}
      />
      <FloatingActionButton
        icon="plus"
        label="Create Trip"
        onPress={() => navigation.navigate("CreateTrip")}
        right={gutter}
      />
    </View>
  );
}

function createStyles(colors: Palette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.surface },
    content: { width: "100%", maxWidth: CONTENT_MAX_WIDTH, alignSelf: "center", paddingBottom: FAB_CLEARANCE },
    tabs: { flexDirection: "row", gap: 8, marginBottom: 16 },
    row: { flexDirection: "row", gap: GRID_GAP },
    cell: { flex: 1, minWidth: 0 },
  });
}
