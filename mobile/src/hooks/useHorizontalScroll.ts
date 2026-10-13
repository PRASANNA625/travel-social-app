import { useRef, useState } from "react";
import type { FlatList, LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent } from "react-native";

// Tracks a horizontal FlatList's scroll position so desktop arrow buttons can
// page through it (mouse users can't easily scroll sideways) and hide at the ends.
export function useHorizontalScroll<T>(step: number) {
  const ref = useRef<FlatList<T>>(null);
  const [scroll, setScroll] = useState({ offset: 0, contentWidth: 0, viewportWidth: 0 });

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    setScroll({ offset: contentOffset.x, contentWidth: contentSize.width, viewportWidth: layoutMeasurement.width });
  };

  const scrollBy = (direction: 1 | -1) => {
    ref.current?.scrollToOffset({ offset: Math.max(0, scroll.offset + direction * step), animated: true });
  };

  return {
    ref,
    scrollBy,
    canScrollBack: scroll.offset > 4,
    canScrollForward: scroll.offset + scroll.viewportWidth < scroll.contentWidth - 4,
    listProps: {
      onScroll,
      scrollEventThrottle: 32,
      onContentSizeChange: (w: number) => setScroll((prev) => ({ ...prev, contentWidth: w })),
      onLayout: (e: LayoutChangeEvent) => {
        const viewportWidth = e.nativeEvent.layout.width;
        setScroll((prev) => ({ ...prev, viewportWidth }));
      },
    },
  };
}
