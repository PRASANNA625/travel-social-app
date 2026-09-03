import { create } from "zustand";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { User } from "../types";

const TOKEN_KEY = "travel_social_token";

// expo-secure-store has no web implementation, so fall back to AsyncStorage there.
const tokenStorage =
  Platform.OS === "web"
    ? {
        getItemAsync: (key: string) => AsyncStorage.getItem(key),
        setItemAsync: (key: string, value: string) => AsyncStorage.setItem(key, value),
        deleteItemAsync: (key: string) => AsyncStorage.removeItem(key),
      }
    : SecureStore;

interface AuthState {
  token: string | null;
  user: User | null;
  isHydrated: boolean;
  hydrate: () => Promise<void>;
  login: (token: string, user: User) => Promise<void>;
  setUser: (user: User) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,
  isHydrated: false,

  hydrate: async () => {
    const token = await tokenStorage.getItemAsync(TOKEN_KEY);
    set({ token, isHydrated: true });
  },

  login: async (token, user) => {
    await tokenStorage.setItemAsync(TOKEN_KEY, token);
    set({ token, user });
  },

  setUser: (user) => set({ user }),

  logout: () => {
    tokenStorage.deleteItemAsync(TOKEN_KEY).catch(() => {});
    set({ token: null, user: null });
  },
}));
