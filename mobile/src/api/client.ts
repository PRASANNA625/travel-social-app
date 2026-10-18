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

// While a password change is in flight, requests sent with the old token can be refused
// before the new token arrives; those must not sign the user out.
let tokenSwaps = 0;
export async function duringTokenSwap<T>(fn: () => Promise<T>): Promise<T> {
  tokenSwaps++;
  try {
    return await fn();
  } finally {
    tokenSwaps--;
  }
}

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Only sign out if the rejected request used the current token: a request sent
      // just before a password change swapped the token must not sign the user out.
      const current = useAuthStore.getState().token;
      const sent = error.config?.headers?.Authorization;
      const swapping = tokenSwaps > 0 && error.response.data?.code === "SESSION_EXPIRED";
      if (current && sent === `Bearer ${current}` && !swapping) {
        useAuthStore.getState().logout();
        if (error.response.data?.code === "SESSION_EXPIRED") {
          Alert.alert("Signed out", "Your password was changed. Please sign in again.");
        }
      }
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
