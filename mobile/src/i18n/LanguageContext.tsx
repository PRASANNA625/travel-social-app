import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LANGUAGES, type LanguageCode } from "./languages";
import en from "./translations/en.json";
import hi from "./translations/hi.json";
import ta from "./translations/ta.json";
import te from "./translations/te.json";
import kn from "./translations/kn.json";

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

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (stored && LANGUAGES.some((l) => l.code === stored)) {
          setLanguageState(stored as LanguageCode);
        }
      })
      .catch(() => {});
  }, []);

  const setLanguage = (code: LanguageCode) => {
    setLanguageState(code);
    AsyncStorage.setItem(STORAGE_KEY, code).catch(() => {});
  };

  const t = (key: string): string => translations[language]?.[key] ?? translations.en[key] ?? key;

  return <LanguageContext.Provider value={{ language, setLanguage, t }}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}
