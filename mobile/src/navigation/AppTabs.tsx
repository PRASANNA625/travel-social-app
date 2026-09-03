import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Text } from "react-native";
import type { AppTabParamList } from "./types";
import { DiscoverScreen } from "../screens/DiscoverScreen";
import { MyTripsScreen } from "../screens/MyTripsScreen";
import { NotificationsScreen } from "../screens/NotificationsScreen";
import { ProfileScreen } from "../screens/ProfileScreen";

const Tab = createBottomTabNavigator<AppTabParamList>();

const ICONS: Record<keyof AppTabParamList, string> = {
  Discover: "🧭",
  MyTrips: "🎒",
  Notifications: "🔔",
  Profile: "👤",
};

export function AppTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: () => <Text style={{ fontSize: 18 }}>{ICONS[route.name as keyof AppTabParamList]}</Text>,
      })}
    >
      <Tab.Screen name="Discover" component={DiscoverScreen} options={{ title: "Discover" }} />
      <Tab.Screen name="MyTrips" component={MyTripsScreen} options={{ title: "My Trips" }} />
      <Tab.Screen name="Notifications" component={NotificationsScreen} options={{ title: "Notifications" }} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ title: "Profile" }} />
    </Tab.Navigator>
  );
}
