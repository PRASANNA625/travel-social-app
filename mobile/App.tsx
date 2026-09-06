import { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DarkTheme, DefaultTheme, NavigationContainer } from "@react-navigation/native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ActivityIndicator, View } from "react-native";
import { useAuthStore } from "./src/store/authStore";
import { RootNavigator } from "./src/navigation/RootNavigator";
import { LanguageProvider } from "./src/i18n/LanguageContext";
import { ThemeProvider, useTheme } from "./src/theme/ThemeContext";

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

function AppContent() {
  const hydrate = useAuthStore((s) => s.hydrate);
  const isHydrated = useAuthStore((s) => s.isHydrated);
  const { scheme, colors } = useTheme();

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  if (!isHydrated) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const navigationTheme = {
    ...(scheme === "dark" ? DarkTheme : DefaultTheme),
    colors: {
      ...(scheme === "dark" ? DarkTheme.colors : DefaultTheme.colors),
      background: colors.surface,
      card: colors.navBarBg,
      text: colors.ink,
      border: colors.border,
      primary: colors.primary,
    },
  };

  return (
    <LanguageProvider>
      <NavigationContainer theme={navigationTheme}>
        <RootNavigator />
      </NavigationContainer>
    </LanguageProvider>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <AppContent />
          <StatusBarBridge />
        </ThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

function StatusBarBridge() {
  const { colors } = useTheme();
  return <StatusBar style={colors.statusBarStyle} />;
}
