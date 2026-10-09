export const LOCAL_LANGUAGE_STORAGE_KEY = "musicwiki.i18n.v1";

export interface LocalLanguagePack {
  locale: string;
  name: string;
  translations: Record<string, string>;
}

export interface LocalLanguageState {
  packs: LocalLanguagePack[];
  selectedLocale: string;
}

export function emptyLocalLanguageState(): LocalLanguageState {
  return { packs: [], selectedLocale: "en" };
}

export function loadLocalLanguageState(storage?: Storage): LocalLanguageState {
  if (!storage) return emptyLocalLanguageState();
  try {
    const raw = storage.getItem(LOCAL_LANGUAGE_STORAGE_KEY);
    if (!raw) return emptyLocalLanguageState();
    return parseStoredState(JSON.parse(raw));
  } catch {
    return emptyLocalLanguageState();
  }
}

export function saveLocalLanguageState(
  storage: Storage | undefined,
  state: LocalLanguageState,
): { persistent: boolean } {
  if (!storage) return { persistent: false };
  try {
    storage.setItem(LOCAL_LANGUAGE_STORAGE_KEY, JSON.stringify({
      packs: state.packs,
      schema_version: 1,
      selected_locale: state.selectedLocale,
    }));
    return { persistent: true };
  } catch {
    return { persistent: false };
  }
}

function parseStoredState(value: unknown): LocalLanguageState {
  if (!isRecord(value) || value.schema_version !== 1) return emptyLocalLanguageState();
  if (typeof value.selected_locale !== "string" || !Array.isArray(value.packs)) {
    return emptyLocalLanguageState();
  }
  const packs = value.packs.map(parsePack);
  if (packs.some((pack) => pack === null)) return emptyLocalLanguageState();
  return {
    packs: packs as LocalLanguagePack[],
    selectedLocale: value.selected_locale,
  };
}

function parsePack(value: unknown): LocalLanguagePack | null {
  if (!isRecord(value)) return null;
  if (typeof value.locale !== "string" || typeof value.name !== "string") return null;
  if (!isRecord(value.translations)) return null;
  const translations: Record<string, string> = {};
  for (const [key, translation] of Object.entries(value.translations)) {
    if (typeof translation !== "string") return null;
    translations[key] = translation;
  }
  return { locale: value.locale, name: value.name, translations };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
