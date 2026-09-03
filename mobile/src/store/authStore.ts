import { create } from "zustand";
import * as SecureStore from "expo-secure-store";
import type { User } from "../types";

const TOKEN_KEY = "travel_social_token";

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
    const token = await SecureStore.getItemAsync(TOKEN_KEY);
    set({ token, isHydrated: true });
  },

  login: async (token, user) => {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
    set({ token, user });
  },

  setUser: (user) => set({ user }),

  logout: () => {
    SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {});
    set({ token: null, user: null });
  },
}));
