import { Check, Languages, Trash2, Upload } from "lucide-react";
import type { TFunction } from "i18next";
import { useRef, useState, type ChangeEvent } from "react";
import { useTranslation } from "react-i18next";

import { parseTranslationCsv } from "./csv-import.ts";
import { useDismissableLayer } from "../app/shared/useDismissableLayer.ts";
import { en } from "./locales/en.ts";
import {
  loadLocalLanguageState,
  saveLocalLanguageState,
  type LocalLanguagePack,
} from "./storage.ts";

interface LanguageMenuProps {
  storage?: Storage;
}

export function LanguageMenu({ storage = browserStorage() }: LanguageMenuProps) {
  const { i18n, t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState("");
  const [localPacks, setLocalPacks] = useState<LocalLanguagePack[]>(
    () => loadLocalLanguageState(storage).packs,
  );
  const inputRef = useRef<HTMLInputElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const currentLocale = i18n.resolvedLanguage ?? i18n.language ?? "en";
  const currentName = languageName(currentLocale, localPacks, t);

  useDismissableLayer(open, (reason) => closeMenu(reason === "escape"), rootRef);

  function closeMenu(restoreFocus = false) {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }

  async function selectLanguage(locale: string) {
    await i18n.changeLanguage(locale);
    closeMenu(true);
  }

  async function importCsv(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const result = await parseTranslationCsv(await file.text(), new Set(Object.keys(en)));
    if (result.status === "invalid") {
      setStatus(t("language.importFailed", { error: result.errors[0] ?? "Invalid CSV" }));
      return;
    }
    const merged = mergePacks(localPacks, result.packs);
    for (const pack of result.packs) {
      i18n.addResourceBundle(pack.locale, "translation", pack.translations, true, true);
    }
    const selected = result.packs[0]!;
    const write = saveLocalLanguageState(storage, {
      packs: merged,
      selectedLocale: selected.locale,
    });
    setLocalPacks(merged);
    await i18n.changeLanguage(selected.locale);
    setStatus(t(
      write.persistent ? "language.importSuccess" : "language.importSessionOnly",
      { name: selected.name },
    ));
    closeMenu(true);
  }

  async function deleteLanguage(pack: LocalLanguagePack) {
    if (currentLocale === pack.locale) await i18n.changeLanguage("en");
    i18n.removeResourceBundle(pack.locale, "translation");
    const next = localPacks.filter((candidate) => candidate.locale !== pack.locale);
    setLocalPacks(next);
    saveLocalLanguageState(storage, {
      packs: next,
      selectedLocale: currentLocale === pack.locale ? "en" : currentLocale,
    });
    setStatus(t("language.deleted", { name: pack.name }));
  }

  return (
    <div className="language-menu" ref={rootRef}>
      <button
        aria-controls="language-menu-popover"
        aria-expanded={open}
        aria-label={t("language.select")}
        className="language-menu-trigger"
        onClick={() => setOpen((value) => !value)}
        ref={triggerRef}
        title={t("language.select")}
        type="button"
      >
        <Languages aria-hidden="true" size={16} />
        <span>{currentName}</span>
      </button>
      <div
        aria-hidden={!open}
        className="language-menu-popover"
        hidden={!open}
        id="language-menu-popover"
      >
        {[
          { locale: "en", name: t("language.english") },
          { locale: "zh-CN", name: t("language.simplifiedChinese") },
        ].map((language) => (
          <button key={language.locale} onClick={() => void selectLanguage(language.locale)} type="button">
            <span>{language.name}</span>
            {currentLocale === language.locale ? <Check aria-hidden="true" size={10} /> : null}
          </button>
        ))}
        {localPacks.map((pack) => (
          <div className="language-menu-local" key={pack.locale}>
            <button onClick={() => void selectLanguage(pack.locale)} type="button">
              <span>{pack.name}</span>
              {currentLocale === pack.locale ? <Check aria-hidden="true" size={10} /> : null}
            </button>
            <button
              aria-label={t("language.delete", { name: pack.name })}
              onClick={() => void deleteLanguage(pack)}
              title={t("language.delete", { name: pack.name })}
              type="button"
            >
              <Trash2 aria-hidden="true" size={10} />
            </button>
          </div>
        ))}
        <button onClick={() => inputRef.current?.click()} type="button">
          <Upload aria-hidden="true" size={10} />
          <span>{t("language.import")}</span>
        </button>
        <input
          accept=".csv,text/csv"
          aria-label={t("language.import")}
          className="sr-only"
          onChange={(event) => void importCsv(event)}
          ref={inputRef}
          type="file"
        />
      </div>
      <span aria-live="polite" className="sr-only">{status}</span>
    </div>
  );
}

function mergePacks(
  current: LocalLanguagePack[],
  incoming: LocalLanguagePack[],
): LocalLanguagePack[] {
  const packs = new Map(current.map((pack) => [pack.locale, pack]));
  for (const pack of incoming) packs.set(pack.locale, pack);
  return [...packs.values()].sort((left, right) => left.locale.localeCompare(right.locale));
}

function languageName(
  locale: string,
  packs: LocalLanguagePack[],
  t: TFunction,
): string {
  if (locale === "zh-CN") return t("language.simplifiedChinese");
  if (locale === "en") return t("language.english");
  return packs.find((pack) => pack.locale === locale)?.name ?? locale;
}

function browserStorage(): Storage | undefined {
  return typeof window === "undefined" ? undefined : window.localStorage;
}
