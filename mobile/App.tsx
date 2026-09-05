import { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NavigationContainer } from "@react-navigation/native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ActivityIndicator, View } from "react-native";
import { useAuthStore } from "./src/store/authStore";
import { RootNavigator } from "./src/navigation/RootNavigator";
import { LanguageProvider } from "./src/i18n/LanguageContext";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      // Treat data as fresh for 30s so switching tabs/screens shows cached
      // data instantly instead of re-fetching from the network every time -
      // mutations already call invalidateQueries/setQueryData explicitly
      // wherever a change needs to be reflected sooner, and sockets push
      // real-time updates (notifications, chat) independent of this.
      staleTime: 30_000,
    },
  },
});

export default function App() {
  const hydrate = useAuthStore((s) => s.hydrate);
  const isHydrated = useAuthStore((s) => s.isHydrated);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  if (!isHydrated) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <LanguageProvider>
          <NavigationContainer>
            <RootNavigator />
          </NavigationContainer>
        </LanguageProvider>
        <StatusBar style="auto" />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
