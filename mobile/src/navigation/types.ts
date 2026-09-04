export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
  PhoneLogin: undefined;
};

export type AppStackParamList = {
  Tabs: undefined;
  TripDetail: { tripId: string };
  CreateTrip: { tripId?: string } | undefined;
  JoinRequestsInbox: { tripId: string };
  GroupChat: { groupId: string; tripTitle: string };
  EditProfile: undefined;
  UserProfile: { userId: string };
};

export type AppTabParamList = {
  Discover: undefined;
  MyTrips: undefined;
  Notifications: undefined;
  Profile: undefined;
};
