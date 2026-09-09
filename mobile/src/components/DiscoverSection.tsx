import { useMemo } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import type { Trip } from "../types";
import { TripCard } from "./TripCard";
import { TripCardSkeleton } from "./TripCardSkeleton";
import { useTheme } from "../theme/ThemeContext";
import type { Palette } from "../theme/palettes";

const CARD_WIDTH = 280;

export function DiscoverSection({
  title,
  emoji,
  trips,
  isLoading,
  onTripPress,
}: {
  title: string;
  emoji: string;
  trips: Trip[] | undefined;
  isLoading: boolean;
  onTripPress: (trip: Trip) => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  if (!isLoading && (!trips || trips.length === 0)) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>
        {emoji} {title}
      </Text>
      {isLoading ? (
        <View style={styles.row}>
          <View style={styles.cardWrap}>
            <TripCardSkeleton />
          </View>
          <View style={styles.cardWrap}>
            <TripCardSkeleton />
          </View>
        </View>
      ) : (
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.row}
          data={trips}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={styles.cardWrap}>
              <TripCard trip={item} onPress={() => onTripPress(item)} />
            </View>
          )}
        />
      )}
    </View>
  );
}

function createStyles(colors: Palette) {
  return StyleSheet.create({
    section: { marginTop: 18 },
    sectionTitle: { fontSize: 16, fontWeight: "700", color: colors.ink, marginBottom: 10, marginHorizontal: 16 },
    row: { paddingHorizontal: 16, gap: 12 },
    cardWrap: { width: CARD_WIDTH },
  });
}
