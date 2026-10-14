import { useWindowDimensions } from "react-native";

// Window width at which the app switches from bottom tabs to a left sidebar.
export const DESKTOP_MIN_WIDTH = 1024;
export const SIDEBAR_WIDTH = 232;
// Content stops growing past this so cards don't stretch on very wide screens.
export const CONTENT_MAX_WIDTH = 1440;

export function useResponsiveLayout() {
  const { width, height } = useWindowDimensions();
  const isDesktop = width >= DESKTOP_MIN_WIDTH;
  const contentWidth = Math.min(width - (isDesktop ? SIDEBAR_WIDTH : 0), CONTENT_MAX_WIDTH);
  return { width, height, isDesktop, contentWidth };
}

// Grid columns for a given content width: 4 on desktop, 2 on tablet, 1 on phones.
export function gridColumnsFor(contentWidth: number) {
  if (contentWidth >= 1100) return 4;
  if (contentWidth >= 900) return 3;
  if (contentWidth >= 560) return 2;
  return 1;
}

// Splits items into rows of `columns` for grid lists (each row renders its cells plus
// empty fillers, so a short last row keeps the same card widths).
export function toRows<T>(items: readonly T[], columns: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += columns) rows.push(items.slice(i, i + columns));
  return rows;
}
