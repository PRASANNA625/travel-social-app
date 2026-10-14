import type { ComponentProps } from "react";
import { StyleSheet, Text, View } from "react-native";
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

const hiddenOnBottomBar = { tabBarButton: () => null };
// Tablets have room for every tab; phones leave Meetups to Discover's "See all".
const TABLET_MIN_WIDTH = 600;

// Tab icon with an unread badge. Drawn here rather than with tabBarBadge,
// whose fixed-width box cut two-digit counts down to "3..".
function TabIcon({ name, color, count }: { name: IconName; color: string; count: number }) {
  const { colors } = useTheme();
  return (
    <View>
      <MaterialCommunityIcons name={name} size={22} color={color} />
      {count > 0 && (
        <View style={[styles.badge, { backgroundColor: colors.danger, borderColor: colors.navBarBg }]}>
          <Text style={styles.badgeText}>{count > 99 ? "99+" : count}</Text>
        </View>
      )}
    </View>
  );
}

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
  const { isDesktop, width } = useResponsiveLayout();
  const counts: Partial<Record<keyof AppTabParamList, number>> = { Notifications: unreadCount, Messages: unreadChats };

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
        // Labels under the icons at every width (tablets would put them beside), so badges never sit on a label.
        tabBarLabelPosition: "below-icon",
        tabBarIcon: ({ focused, color }) => {
          const key = route.name as keyof AppTabParamList;
          const icon = TAB_ICONS[key];
          return <TabIcon name={focused ? icon.active : icon.inactive} color={color} count={counts[key] ?? 0} />;
        },
      })}
    >
      <Tab.Screen name="Discover" component={DiscoverScreen} options={{ title: "Discover", headerShown: false }} />
      <Tab.Screen name="MyTrips" component={MyTripsScreen} options={{ title: "My Trips" }} />
      <Tab.Screen
        name="Meetups"
        component={TravelBuddiesScreen}
        options={{ title: "Meetups", ...(width >= TABLET_MIN_WIDTH ? {} : hiddenOnBottomBar) }}
      />
      <Tab.Screen
        name="Messages"
        component={MessagesScreen}
        options={{
          title: "Messages",
          tabBarAccessibilityLabel: unreadChats > 0 ? `Messages, ${unreadChats} unread` : "Messages",
        }}
      />
      <Tab.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{
          title: "Notifications",
          headerShown: false,
          tabBarAccessibilityLabel: unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications",
        }}
      />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ title: "Profile", headerShown: false }} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: "absolute",
    top: -5,
    left: 13,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { color: "#ffffff", fontSize: 10, fontWeight: "800", lineHeight: 12 },
});
