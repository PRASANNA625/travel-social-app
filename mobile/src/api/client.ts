import axios from "axios";
import Constants from "expo-constants";
import { useAuthStore } from "../store/authStore";

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
    }
    return Promise.reject(error);
  }
);
