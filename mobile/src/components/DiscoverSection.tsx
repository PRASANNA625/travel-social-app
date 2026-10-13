import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { Trip } from "../types";
import { FeaturedTripCard, FEATURED_CARD_HEIGHT } from "./FeaturedTripCard";
import { Carousel, CAROUSEL_GAP } from "./Carousel";
import { SectionHeader } from "./SectionHeader";
import { Skeleton } from "./theme/Skeleton";
import { RADIUS } from "../theme/tokens";
import { useTheme } from "../theme/ThemeContext";
import type { Palette } from "../theme/palettes";

export const SECTION_GAP = CAROUSEL_GAP;

export interface DiscoverSectionTab {
  key: string;
  label: string;
  trips: Trip[] | undefined;
  isLoading: boolean;
}

// One photo carousel for the curated trip lists (Featured, For you, Near you, ...).
// Lists with nothing in them are left out, and the tab row only shows when
// there's more than one list to pick from.
export function DiscoverSection({
  title,
  tabs,
  onTripPress,
  cardWidth,
  horizontalPadding,
  showArrows,
  tabsInline,
}: {
  title: string;
  tabs: DiscoverSectionTab[];
  onTripPress: (trip: Trip) => void;
  cardWidth: number;
  horizontalPadding: number;
  showArrows: boolean;
  // Tabs beside the title on wide screens, on their own row on phones.
  tabsInline: boolean;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const visibleTabs = tabs.filter((tab) => tab.isLoading || (tab.trips?.length ?? 0) > 0);
  if (visibleTabs.length === 0) return null;
  const active = visibleTabs.find((tab) => tab.key === selectedKey) ?? visibleTabs[0];

  const tabRow =
    visibleTabs.length > 1 ? (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={tabsInline ? styles.tabsInline : styles.tabsBelow}
        contentContainerStyle={[styles.tabs, !tabsInline && { paddingHorizontal: horizontalPadding }]}
      >
        {visibleTabs.map((tab) => {
          const selected = tab.key === active.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tab, selected && styles.tabActive]}
              onPress={() => setSelectedKey(tab.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
            >
              <Text style={[styles.tabText, selected && styles.tabTextActive]}>{tab.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    ) : null;

  return (
    <View style={styles.section}>
      <SectionHeader title={title} horizontalPadding={horizontalPadding} right={tabsInline ? tabRow : undefined} />
      {!tabsInline && tabRow}
      {active.isLoading ? (
        <View style={[styles.skeletonRow, { paddingHorizontal: horizontalPadding }]}>
          <Skeleton style={[styles.skeleton, { width: cardWidth }]} />
          <Skeleton style={[styles.skeleton, { width: cardWidth }]} />
        </View>
      ) : (
        <Carousel
          // Remount per tab so each list starts scrolled to the beginning.
          key={active.key}
          data={active.trips ?? []}
          keyExtractor={(trip) => trip.id}
          renderItem={(trip) => <FeaturedTripCard trip={trip} onPress={() => onTripPress(trip)} />}
          itemWidth={cardWidth}
          horizontalPadding={horizontalPadding}
          showArrows={showArrows}
          arrowTop={4 + FEATURED_CARD_HEIGHT / 2}
          label={`${active.label.toLowerCase()} trips`}
        />
      )}
    </View>
  );
}

function createStyles(colors: Palette) {
  return StyleSheet.create({
    section: { marginTop: 28 },
    tabsInline: { flexGrow: 0, flexShrink: 1 },
    tabsBelow: { flexGrow: 0, marginTop: -4, marginBottom: 12 },
    tabs: { flexDirection: "row", gap: 6 },
    tab: {
      height: 32,
      paddingHorizontal: 14,
      borderRadius: RADIUS.pill,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.border,
    },
    tabActive: { backgroundColor: colors.primaryMuted, borderColor: colors.primary },
    tabText: { fontSize: 13, fontWeight: "600", color: colors.ink },
    tabTextActive: { color: colors.primary, fontWeight: "700" },
    skeletonRow: { flexDirection: "row", gap: CAROUSEL_GAP, paddingVertical: 4 },
    skeleton: { height: FEATURED_CARD_HEIGHT, borderRadius: 16 },
  });
}
