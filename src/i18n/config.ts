import i18next, { createInstance, type i18n } from "i18next";
import { initReactI18next } from "react-i18next";

import { en } from "./locales/en.ts";
import { zhCN } from "./locales/zh-CN.ts";
import { loadLocalLanguageState, saveLocalLanguageState } from "./storage.ts";

export function createI18n(storage?: Storage): i18n {
  const localState = loadLocalLanguageState(storage);
  const resources: Record<string, { translation: Record<string, string> }> = {
    en: { translation: en },
    "zh-CN": { translation: zhCN },
  };
  for (const pack of localState.packs) {
    resources[pack.locale] = { translation: pack.translations };
  }
  const initialLocale = localState.selectedLocale in resources
    ? localState.selectedLocale
    : "en";
  const instance = createInstance();
  void instance.use(initReactI18next).init({
    fallbackLng: "en",
    initAsync: false,
    interpolation: { escapeValue: false },
    keySeparator: false,
    lng: initialLocale,
    resources,
    returnNull: false,
  });
  syncDocumentLanguage(instance);
  instance.on("languageChanged", (locale) => {
    syncDocumentLanguage(instance);
    saveLocalLanguageState(storage, {
      ...loadLocalLanguageState(storage),
      selectedLocale: locale,
    });
  });
  return instance;
}

function syncDocumentLanguage(instance: i18n): void {
  if (typeof document === "undefined") return;
  document.documentElement.lang = instance.resolvedLanguage ?? instance.language ?? "en";
  document.title = instance.t("app.title");
}

export const appI18n = createI18n(
  typeof window === "undefined" ? undefined : window.localStorage,
);

export { i18next };
