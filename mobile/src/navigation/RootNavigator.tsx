import { useAuthStore } from "../store/authStore";
import { AuthStack } from "./AuthStack";
import { AppNavigator } from "./AppNavigator";

export function RootNavigator() {
  const token = useAuthStore((s) => s.token);
  return token ? <AppNavigator /> : <AuthStack />;
}
