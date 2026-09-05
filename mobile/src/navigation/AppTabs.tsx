import type { ComponentProps } from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { AppTabParamList } from "./types";
import { DiscoverScreen } from "../screens/DiscoverScreen";
import { MyTripsScreen } from "../screens/MyTripsScreen";
import { NotificationsScreen } from "../screens/NotificationsScreen";
import { ProfileScreen } from "../screens/ProfileScreen";

const Tab = createBottomTabNavigator<AppTabParamList>();

type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

const ICONS: Record<keyof AppTabParamList, { active: IconName; inactive: IconName }> = {
  Discover: { active: "compass", inactive: "compass-outline" },
  MyTrips: { active: "bag-personal", inactive: "bag-personal-outline" },
  Notifications: { active: "bell", inactive: "bell-outline" },
  Profile: { active: "account-circle", inactive: "account-circle-outline" },
};

export function AppTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarActiveTintColor: "#0f766e",
        tabBarInactiveTintColor: "#94a3b8",
        tabBarStyle: { borderTopWidth: 1, borderTopColor: "#f1f5f9" },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
        tabBarIcon: ({ focused, color }) => {
          const icon = ICONS[route.name as keyof AppTabParamList];
          return <MaterialCommunityIcons name={focused ? icon.active : icon.inactive} size={22} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Discover" component={DiscoverScreen} options={{ title: "Discover" }} />
      <Tab.Screen name="MyTrips" component={MyTripsScreen} options={{ title: "My Trips" }} />
      <Tab.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{ title: "Notifications", headerShown: false }}
      />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ title: "Profile", headerShown: false }} />
    </Tab.Navigator>
  );
}
