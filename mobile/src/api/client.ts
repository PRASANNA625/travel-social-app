import axios from "axios";
import Constants from "expo-constants";
import { useAuthStore } from "../store/authStore";
import { Alert } from "../utils/alert";

export const API_URL: string = (Constants.expoConfig?.extra?.apiUrl as string | undefined) ?? "http://localhost:4000";

export const apiClient = axios.create({ baseURL: API_URL });

apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().logout();
    } else if (error.response?.status === 403 && error.response.data?.code === "ACCOUNT_SUSPENDED") {
      signOutSuspended();
    }
    return Promise.reject(error);
  }
);

// Called when the backend reports this account as suspended (HTTP or socket).
let suspendedNoticeShown = false;
export function signOutSuspended(reason?: string) {
  if (!useAuthStore.getState().token) return;
  useAuthStore.getState().logout();
  if (suspendedNoticeShown) return;
  suspendedNoticeShown = true;
  Alert.alert(
    "Account suspended",
    reason
      ? `Your account has been suspended: ${reason}. Contact support if you think this is a mistake.`
      : "Your account has been suspended. Contact support if you think this is a mistake.",
    [{ text: "OK", onPress: () => (suspendedNoticeShown = false) }]
  );
}
