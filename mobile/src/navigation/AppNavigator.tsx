import { createNativeStackNavigator } from "@react-navigation/native-stack";
import type { AppStackParamList } from "./types";
import { AppTabs } from "./AppTabs";
import { TripDetailScreen } from "../screens/TripDetailScreen";
import { CreateTripScreen } from "../screens/CreateTripScreen";
import { JoinRequestsInboxScreen } from "../screens/JoinRequestsInboxScreen";
import { GroupChatScreen } from "../screens/GroupChatScreen";
import { EditProfileScreen } from "../screens/EditProfileScreen";
import { UserProfileScreen } from "../screens/UserProfileScreen";

const Stack = createNativeStackNavigator<AppStackParamList>();

export function AppNavigator() {
  return (
    <Stack.Navigator>
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
      <Stack.Screen
        name="GroupChat"
        component={GroupChatScreen}
        options={({ route }) => ({ title: route.params.tripTitle })}
      />
      <Stack.Screen name="EditProfile" component={EditProfileScreen} options={{ title: "Edit Profile" }} />
      <Stack.Screen name="UserProfile" component={UserProfileScreen} options={{ title: "Profile" }} />
    </Stack.Navigator>
  );
}
