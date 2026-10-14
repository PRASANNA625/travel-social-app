import { StyleSheet, View } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import type { AppStackParamList, AppTabParamList } from "./types";
import { AppTabs, TAB_ICONS, TAB_ITEMS, useNavBadges } from "./AppTabs";
import { SideNavBar, type SideNavItem } from "./SideNavBar";
import { navigateToTab, navigationRef, useActiveTab, useRootRouteName } from "./navigationRef";
import { useMe } from "../api/users";
import { isStaff } from "../api/admin";
import { useResponsiveLayout } from "../theme/layout";
import { TripDetailScreen } from "../screens/TripDetailScreen";
import { CreateTripScreen } from "../screens/CreateTripScreen";
import { JoinRequestsInboxScreen } from "../screens/JoinRequestsInboxScreen";
import { GroupChatScreen } from "../screens/GroupChatScreen";
import { EditProfileScreen } from "../screens/EditProfileScreen";
import { UserProfileScreen } from "../screens/UserProfileScreen";
import { AssistantScreen } from "../screens/AssistantScreen";
import { SettingsScreen } from "../screens/SettingsScreen";
import { TravelBuddiesScreen } from "../screens/TravelBuddiesScreen";
import { ConnectionRequestsScreen } from "../screens/ConnectionRequestsScreen";
import { BlockedUsersScreen } from "../screens/BlockedUsersScreen";
import { AdminScreen } from "../screens/admin/AdminScreen";

const Stack = createNativeStackNavigator<AppStackParamList>();

function DesktopSidebar() {
  const activeTab = useActiveTab();
  const badges = useNavBadges();
  const { data: me } = useMe();
  const items: SideNavItem[] = TAB_ITEMS.map(({ key, label }) => ({
    key,
    label,
    icon: TAB_ICONS[key],
    badge: key === "Messages" || key === "Notifications" ? badges[key] || undefined : undefined,
  }));
  // Staff get a link to the admin dashboard (the API checks the role again).
  if (isStaff(me?.role)) {
    items.push({ key: "Admin", label: "Admin", icon: { active: "shield-account", inactive: "shield-account-outline" }, badge: undefined });
  }
  return (
    <SideNavBar
      items={items}
      activeKey={activeTab}
      onSelect={(key) => (key === "Admin" ? navigationRef.navigate("Admin") : navigateToTab(key as keyof AppTabParamList))}
    />
  );
}

export function AppNavigator() {
  const { isDesktop } = useResponsiveLayout();
  // The admin dashboard brings its own navigation, so it gets the full window.
  const routeName = useRootRouteName();
  const stack = (
    // Every screen draws its own ScreenHeader; titles still name the browser tab.
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Tabs" component={AppTabs} options={{ headerShown: false }} />
      <Stack.Screen name="TripDetail" component={TripDetailScreen} options={{ headerShown: false }} />
      <Stack.Screen
        name="CreateTrip"
        component={CreateTripScreen}
        options={({ route }) => ({ title: route.params?.tripId ? "Edit Trip" : "Create a Trip" })}
      />
      <Stack.Screen
        name="JoinRequestsInbox"
        component={JoinRequestsInboxScreen}
        options={{ title: "Join Requests" }}
      />
      <Stack.Screen name="GroupChat" component={GroupChatScreen} options={{ headerShown: false }} />
      <Stack.Screen name="EditProfile" component={EditProfileScreen} options={{ headerShown: false }} />
      <Stack.Screen name="UserProfile" component={UserProfileScreen} options={{ title: "Profile" }} />
      <Stack.Screen name="Assistant" component={AssistantScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Settings" component={SettingsScreen} options={{ headerShown: false }} />
      <Stack.Screen name="TravelBuddies" component={TravelBuddiesScreen} options={{ title: "Travel Buddies" }} />
      <Stack.Screen name="ConnectionRequests" component={ConnectionRequestsScreen} options={{ title: "Connection Requests" }} />
      <Stack.Screen name="BlockedUsers" component={BlockedUsersScreen} options={{ title: "Blocked Users" }} />
      <Stack.Screen name="Admin" component={AdminScreen} options={{ title: "Triply Admin" }} />
    </Stack.Navigator>
  );

  if (!isDesktop) return stack;
  // Desktop: the sidebar stays beside every screen, tabs and stack screens alike.
  return (
    <View style={styles.desktop}>
      {routeName !== "Admin" && <DesktopSidebar />}
      <View style={styles.desktopContent}>{stack}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  desktop: { flex: 1, flexDirection: "row" },
  desktopContent: { flex: 1, minWidth: 0 },
});
