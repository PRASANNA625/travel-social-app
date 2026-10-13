import { useMemo, type ReactElement } from "react";
import { FlatList, StyleSheet, TouchableOpacity, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useHorizontalScroll } from "../hooks/useHorizontalScroll";
import { useTheme } from "../theme/ThemeContext";
import type { Palette } from "../theme/palettes";

export const CAROUSEL_GAP = 16;

// Horizontal row of equal-width cards. On desktop, round arrow buttons page
// through it (mouse users can't easily scroll sideways); touch users swipe.
export function Carousel<T>({
  data,
  keyExtractor,
  renderItem,
  itemWidth,
  horizontalPadding,
  showArrows,
  arrowTop,
  label,
}: {
  data: readonly T[];
  keyExtractor: (item: T) => string;
  renderItem: (item: T) => ReactElement;
  itemWidth: number;
  horizontalPadding: number;
  showArrows: boolean;
  // Vertical position of the arrows, usually the middle of the cards.
  arrowTop: number;
  // Used for the arrows' accessibility labels, e.g. "featured trips".
  label: string;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const scroll = useHorizontalScroll<T>(itemWidth + CAROUSEL_GAP);

  return (
    <View style={styles.wrap}>
      <FlatList
        ref={scroll.ref}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.row, { paddingHorizontal: horizontalPadding }]}
        data={data as T[]}
        keyExtractor={keyExtractor}
        {...scroll.listProps}
        renderItem={({ item }) => <View style={{ width: itemWidth }}>{renderItem(item)}</View>}
      />
      {showArrows && scroll.canScrollBack && (
        <TouchableOpacity
          style={[styles.arrow, { top: arrowTop - 18, left: horizontalPadding - 14 }]}
          onPress={() => scroll.scrollBy(-1)}
          accessibilityLabel={`Previous ${label}`}
        >
          <MaterialCommunityIcons name="chevron-left" size={22} color={colors.ink} />
        </TouchableOpacity>
      )}
      {showArrows && scroll.canScrollForward && (
        <TouchableOpacity
          style={[styles.arrow, { top: arrowTop - 18, right: horizontalPadding - 14 }]}
          onPress={() => scroll.scrollBy(1)}
          accessibilityLabel={`More ${label}`}
        >
          <MaterialCommunityIcons name="chevron-right" size={22} color={colors.ink} />
        </TouchableOpacity>
      )}
    </View>
  );
}

function createStyles(colors: Palette) {
  return StyleSheet.create({
    wrap: { position: "relative" },
    // Vertical padding leaves room for the cards' shadows inside the scroll view.
    row: { flexDirection: "row", gap: CAROUSEL_GAP, paddingVertical: 4 },
    arrow: {
      position: "absolute",
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: colors.ink,
      shadowOpacity: 0.14,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 },
      elevation: 4,
    },
  });
}
