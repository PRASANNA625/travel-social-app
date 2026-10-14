import { useSyncExternalStore } from "react";
import { createNavigationContainerRef, type NavigationState, type PartialState } from "@react-navigation/native";
import type { AppStackParamList, AppTabParamList } from "./types";

// Lets UI that lives outside the navigators (the desktop sidebar) read the
// current route and navigate.
export const navigationRef = createNavigationContainerRef<AppStackParamList>();

type AnyState = NavigationState | PartialState<NavigationState> | undefined;

// The tab the user is "in": the focused tab, also while a stack screen (trip
// details, settings, ...) is open on top of the tabs.
function activeTabFrom(state: AnyState): keyof AppTabParamList {
  const tabsRoute = state?.routes.find((r) => r.name === "Tabs");
  const tabsState = tabsRoute?.state;
  const index = tabsState?.index ?? 0;
  const name = tabsState?.routes[index]?.name;
  return (name as keyof AppTabParamList | undefined) ?? "Discover";
}

function subscribe(onChange: () => void) {
  // "state" fires on every navigation; the ref may not be ready on first subscribe.
  return navigationRef.addListener("state", onChange);
}

export function useActiveTab() {
  return useSyncExternalStore(subscribe, () =>
    navigationRef.isReady() ? activeTabFrom(navigationRef.getRootState()) : "Discover"
  );
}

// Name of the top-level stack route on screen ("Tabs", "TripDetail", ...).
export function useRootRouteName() {
  return useSyncExternalStore(subscribe, () => {
    if (!navigationRef.isReady()) return "Tabs";
    const state = navigationRef.getRootState();
    return state?.routes[state.index ?? 0]?.name ?? "Tabs";
  });
}

export function navigateToTab(tab: keyof AppTabParamList) {
  if (!navigationRef.isReady()) return;
  // Navigating to the existing "Tabs" route also closes any stack screens above it.
  navigationRef.navigate("Tabs", { screen: tab });
}
