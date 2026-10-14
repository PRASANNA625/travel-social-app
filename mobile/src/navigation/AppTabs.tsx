import type { ComponentProps } from "react";
import { BottomTabBar, createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { AppTabParamList } from "./types";
import { DiscoverScreen } from "../screens/DiscoverScreen";
import { MyTripsScreen } from "../screens/MyTripsScreen";
import { TravelBuddiesScreen } from "../screens/TravelBuddiesScreen";
import { MessagesScreen } from "../screens/MessagesScreen";
import { NotificationsScreen } from "../screens/NotificationsScreen";
import { ProfileScreen } from "../screens/ProfileScreen";
import { useNotifications } from "../api/notifications";
import { useMyGroups } from "../api/groups";
import { useTheme } from "../theme/ThemeContext";
import { useResponsiveLayout } from "../theme/layout";

const Tab = createBottomTabNavigator<AppTabParamList>();

type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

export const TAB_ICONS: Record<keyof AppTabParamList, { active: IconName; inactive: IconName }> = {
  Discover: { active: "compass", inactive: "compass-outline" },
  MyTrips: { active: "bag-personal", inactive: "bag-personal-outline" },
  Meetups: { active: "account-group", inactive: "account-group-outline" },
  Messages: { active: "message-text", inactive: "message-text-outline" },
  Notifications: { active: "bell", inactive: "bell-outline" },
  Profile: { active: "account-circle", inactive: "account-circle-outline" },
};

// Sidebar-only routes: the phone bottom bar keeps its four tabs.
const hiddenOnBottomBar = { tabBarButton: () => null };

// Tab order and labels, shared by the phone tab bar and the desktop sidebar.
export const TAB_ITEMS: { key: keyof AppTabParamList; label: string }[] = [
  { key: "Discover", label: "Discover" },
  { key: "MyTrips", label: "My Trips" },
  { key: "Meetups", label: "Meetups" },
  { key: "Messages", label: "Messages" },
  { key: "Notifications", label: "Notifications" },
  { key: "Profile", label: "Profile" },
];

// Unread counts shown on the Messages and Notifications nav items.
export function useNavBadges() {
  const { data } = useNotifications();
  const { data: chats } = useMyGroups();
  return {
    Notifications: data?.unreadCount ?? 0,
    Messages: (chats ?? []).reduce((sum, chat) => sum + chat.unreadCount, 0),
  };
}

export function AppTabs() {
  const { Notifications: unreadCount, Messages: unreadChats } = useNavBadges();
  const { colors } = useTheme();
  const { isDesktop } = useResponsiveLayout();

  return (
    <Tab.Navigator
      // Desktop navigation is the sidebar AppNavigator renders beside the whole stack.
      tabBar={(props) => (isDesktop ? null : <BottomTabBar {...props} />)}
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedLight,
        tabBarStyle: { borderTopWidth: 1, borderTopColor: colors.divider, backgroundColor: colors.navBarBg },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
        tabBarIcon: ({ focused, color }) => {
          const icon = TAB_ICONS[route.name as keyof AppTabParamList];
          return <MaterialCommunityIcons name={focused ? icon.active : icon.inactive} size={22} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Discover" component={DiscoverScreen} options={{ title: "Discover", headerShown: false }} />
      <Tab.Screen name="MyTrips" component={MyTripsScreen} options={{ title: "My Trips" }} />
      <Tab.Screen name="Meetups" component={TravelBuddiesScreen} options={{ title: "Meetups", ...hiddenOnBottomBar }} />
      <Tab.Screen
        name="Messages"
        component={MessagesScreen}
        options={{
          title: "Messages",
          tabBarBadge: unreadChats > 0 ? unreadChats : undefined,
          ...hiddenOnBottomBar,
        }}
      />
      <Tab.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{
          title: "Notifications",
          headerShown: false,
          tabBarBadge: unreadCount > 0 ? unreadCount : undefined,
        }}
      />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ title: "Profile", headerShown: false }} />
    </Tab.Navigator>
  );
}
