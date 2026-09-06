import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Appearance } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { darkPalette, lightPalette, type Palette } from "./palettes";

export type ThemePreference = "light" | "dark" | "system";
export type ColorScheme = "light" | "dark";

interface ThemeContextValue {
  preference: ThemePreference;
  scheme: ColorScheme;
  colors: Palette;
  setPreference: (preference: ThemePreference) => void;
}

const STORAGE_KEY = "app_theme";

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>("system");
  const [systemScheme, setSystemScheme] = useState<ColorScheme>(Appearance.getColorScheme() === "dark" ? "dark" : "light");

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (stored === "light" || stored === "dark" || stored === "system") {
          setPreferenceState(stored);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const subscription = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemScheme(colorScheme === "dark" ? "dark" : "light");
    });
    return () => subscription.remove();
  }, []);

  const setPreference = (next: ThemePreference) => {
    setPreferenceState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  };

  const scheme: ColorScheme = preference === "system" ? systemScheme : preference;
  const colors = useMemo(() => (scheme === "dark" ? darkPalette : lightPalette), [scheme]);

  return (
    <ThemeContext.Provider value={{ preference, scheme, colors, setPreference }}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
