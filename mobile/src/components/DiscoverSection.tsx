import { useMemo, type ComponentProps } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { Trip } from "../types";
import { FeaturedTripCard, FEATURED_CARD_HEIGHT } from "./FeaturedTripCard";
import { Skeleton } from "./theme/Skeleton";
import { useTheme } from "../theme/ThemeContext";
import type { Palette } from "../theme/palettes";

type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

export const SECTION_GAP = 16;

export function DiscoverSection({
  title,
  subtitle,
  icon,
  iconColor,
  trips,
  isLoading,
  onTripPress,
  cardWidth,
  horizontalPadding,
}: {
  title: string;
  subtitle?: string;
  icon: IconName;
  iconColor?: string;
  trips: Trip[] | undefined;
  isLoading: boolean;
  onTripPress: (trip: Trip) => void;
  cardWidth: number;
  horizontalPadding: number;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  if (!isLoading && (!trips || trips.length === 0)) return null;

  return (
    <View style={styles.section}>
      <View style={[styles.header, { paddingHorizontal: horizontalPadding }]}>
        <View style={styles.titleRow}>
          <MaterialCommunityIcons name={icon} size={20} color={iconColor ?? colors.primary} />
          <Text style={styles.sectionTitle}>{title}</Text>
        </View>
        {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      </View>
      {isLoading ? (
        <View style={[styles.row, { paddingHorizontal: horizontalPadding }]}>
          <Skeleton style={[styles.skeleton, { width: cardWidth }]} />
          <Skeleton style={[styles.skeleton, { width: cardWidth }]} />
        </View>
      ) : (
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[styles.row, { paddingHorizontal: horizontalPadding }]}
          data={trips}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={{ width: cardWidth }}>
              <FeaturedTripCard trip={item} onPress={() => onTripPress(item)} />
            </View>
          )}
        />
      )}
    </View>
  );
}

function createStyles(colors: Palette) {
  return StyleSheet.create({
    section: { marginTop: 24 },
    header: { marginBottom: 12 },
    titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    sectionTitle: { fontSize: 18, fontWeight: "700", color: colors.ink },
    subtitle: { fontSize: 13, color: colors.muted, marginTop: 3, marginLeft: 28 },
    row: { flexDirection: "row", gap: SECTION_GAP },
    skeleton: { height: FEATURED_CARD_HEIGHT, borderRadius: 16 },
  });
}
