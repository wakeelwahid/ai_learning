import React, { createContext, useContext, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { I18nManager } from "react-native";
import translations, { Lang, TranslationKey } from "@/i18n/translations";

const LANG_KEY = "app_language";

interface LanguageContextValue {
  language: Lang;
  setLanguage: (lang: Lang) => Promise<void>;
  t: (key: TranslationKey) => string;
  initialized: boolean;
}

const LanguageContext = createContext<LanguageContextValue>({
  language: "en",
  setLanguage: async () => {},
  t: (key) => key,
  initialized: false,
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Lang>("en");
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(LANG_KEY).then((stored) => {
      if (stored) setLanguageState(stored as Lang);
      setInitialized(true);
    });
  }, []);

  const setLanguage = async (lang: Lang) => {
    await AsyncStorage.setItem(LANG_KEY, lang);
    setLanguageState(lang);
    const isRTL = lang === "ur";
    if (I18nManager.isRTL !== isRTL) {
      I18nManager.forceRTL(isRTL);
    }
  };

  const t = (key: TranslationKey): string => {
    return (translations[language] as any)[key] ?? translations.en[key] ?? key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, initialized }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}

export { LANG_KEY };
