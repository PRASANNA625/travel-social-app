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
  replaceToken: (token: string) => Promise<void>;
  setUser: (user: User) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
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
  // After a password change: same user, new token (the old one no longer works).
  // In memory first, so requests from this moment on already carry the new token.
  replaceToken: async (token) => {
    set({ token });
    await tokenStorage.setItemAsync(TOKEN_KEY, token);
  },

  setUser: (user) => set({ user }),

  logout: () => {
    const { token } = get();
    // On web, tabs share storage: if another tab has since stored a newer token (after a
    // password change there), signing this tab out must not erase it.
    tokenStorage
      .getItemAsync(TOKEN_KEY)
      .then((stored) => (!stored || stored === token ? tokenStorage.deleteItemAsync(TOKEN_KEY) : undefined))
      .catch(() => {});
    set({ token: null, user: null });
  },
}));
