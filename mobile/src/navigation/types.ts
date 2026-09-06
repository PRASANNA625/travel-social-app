export type AuthStackParamList = {
  Welcome: undefined;
  Onboarding: undefined;
  Login: undefined;
  Register: undefined;
  PhoneLogin: undefined;
};

export type AppStackParamList = {
  Tabs: undefined;
  TripDetail: { tripId: string; highlightCommentId?: string };
  CreateTrip: { tripId?: string } | undefined;
  JoinRequestsInbox: { tripId: string; highlightRequestId?: string };
  GroupChat: { groupId: string; tripTitle: string; highlightMessageId?: string };
  EditProfile: undefined;
  UserProfile: { userId: string; groupRole?: "OWNER" | "MEMBER" };
};

export type AppTabParamList = {
  Discover: undefined;
  MyTrips: undefined;
  Notifications: undefined;
  Profile: undefined;
};
