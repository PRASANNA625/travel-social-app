import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LANGUAGES, type LanguageCode } from "./languages";
import en from "./translations/en.json";
import hi from "./translations/hi.json";
import ta from "./translations/ta.json";
import te from "./translations/te.json";
import kn from "./translations/kn.json";
import { useMe, useUpdateProfile } from "../api/users";
import { useAuthStore } from "../store/authStore";

const translations: Record<LanguageCode, Record<string, string>> = { en, hi, ta, te, kn };

const STORAGE_KEY = "app_language";

interface LanguageContextValue {
  language: LanguageCode;
  setLanguage: (code: LanguageCode) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<LanguageCode>("en");
  const token = useAuthStore((s) => s.token);
  const { data: user } = useMe();
  const updateProfile = useUpdateProfile();

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (stored && LANGUAGES.some((l) => l.code === stored)) {
          setLanguageState(stored as LanguageCode);
        }
      })
      .catch(() => {});
  }, []);

  // Once we know the signed-in user's saved preference, adopt it locally so
  // the language follows the account across devices/reinstalls rather than
  // only living in this device's AsyncStorage. A no-op once they match (e.g.
  // right after setLanguage's own mutation succeeds and updates this cache).
  useEffect(() => {
    if (user?.preferredLanguage && user.preferredLanguage !== language) {
      setLanguageState(user.preferredLanguage);
      AsyncStorage.setItem(STORAGE_KEY, user.preferredLanguage).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.preferredLanguage]);

  const setLanguage = (code: LanguageCode) => {
    setLanguageState(code);
    AsyncStorage.setItem(STORAGE_KEY, code).catch(() => {});
    // Best-effort sync to the backend when signed in - a switch must never
    // block or surface an error over a network hiccup, so no callbacks here.
    if (token) {
      updateProfile.mutate({ preferredLanguage: code });
    }
  };

  const t = (key: string): string => translations[language]?.[key] ?? translations.en[key] ?? key;

  return <LanguageContext.Provider value={{ language, setLanguage, t }}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}
