import { StyleSheet, View } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import type { AppStackParamList, AppTabParamList } from "./types";
import { AppTabs, TAB_ICONS, TAB_ITEMS, useNavBadges } from "./AppTabs";
import { SideNavBar } from "./SideNavBar";
import { navigateToTab, useActiveTab } from "./navigationRef";
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

const Stack = createNativeStackNavigator<AppStackParamList>();

function DesktopSidebar() {
  const activeTab = useActiveTab();
  const badges = useNavBadges();
  const items = TAB_ITEMS.map(({ key, label }) => ({
    key,
    label,
    icon: TAB_ICONS[key],
    badge: key === "Messages" || key === "Notifications" ? badges[key] || undefined : undefined,
  }));
  return (
    <SideNavBar items={items} activeKey={activeTab} onSelect={(key) => navigateToTab(key as keyof AppTabParamList)} />
  );
}

export function AppNavigator() {
  const { isDesktop } = useResponsiveLayout();
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
    </Stack.Navigator>
  );

  if (!isDesktop) return stack;
  // Desktop: the sidebar stays beside every screen, tabs and stack screens alike.
  return (
    <View style={styles.desktop}>
      <DesktopSidebar />
      <View style={styles.desktopContent}>{stack}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  desktop: { flex: 1, flexDirection: "row" },
  desktopContent: { flex: 1, minWidth: 0 },
});
