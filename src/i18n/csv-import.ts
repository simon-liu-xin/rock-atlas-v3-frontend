import type { LocalLanguagePack } from "./storage.ts";

export const MAX_TRANSLATION_CSV_BYTES = 2 * 1024 * 1024;

export type TranslationCsvResult =
  | { status: "ready"; packs: LocalLanguagePack[] }
  | { status: "invalid"; errors: string[] };

const builtInLocales = new Set(["en", "zh-CN"]);
const localePattern = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;

export async function parseTranslationCsv(
  source: string,
  knownKeys: ReadonlySet<string>,
): Promise<TranslationCsvResult> {
  if (new TextEncoder().encode(source).byteLength > MAX_TRANSLATION_CSV_BYTES) {
    return invalid("The CSV file exceeds 2 MiB.");
  }

  const Papa = (await import("papaparse")).default;
  const parsed = Papa.parse<Record<string, string>>(source, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (header) => header.replace(/^\uFEFF/, "").trim(),
  });
  const errors = parsed.errors.map((error) => error.message);
  if (parsed.meta.renamedHeaders && Object.keys(parsed.meta.renamedHeaders).length > 0) {
    errors.push("The CSV contains duplicate language columns.");
  }

  const fields = parsed.meta.fields ?? [];
  if (fields[0] !== "key") errors.push('The first CSV column must be "key".');
  const locales = fields.slice(1);
  if (locales.length === 0) errors.push("The CSV must contain at least one language column.");
  for (const locale of locales) {
    if (!localePattern.test(locale)) errors.push(`Invalid language code: ${locale}.`);
    if (builtInLocales.has(locale)) errors.push(`Built-in language cannot be overwritten: ${locale}.`);
  }

  const seenKeys = new Set<string>();
  for (const row of parsed.data) {
    const key = row.key?.trim();
    if (!key) {
      errors.push("Every translation row must include a key.");
      continue;
    }
    if (seenKeys.has(key)) errors.push(`Duplicate translation key: ${key}.`);
    seenKeys.add(key);
    if (!knownKeys.has(key)) errors.push(`Unknown translation key: ${key}.`);
  }

  const packs = locales.map((locale): LocalLanguagePack => {
    const translations: Record<string, string> = {};
    for (const row of parsed.data) {
      const key = row.key?.trim();
      const translation = row[locale]?.trim();
      if (key && translation) translations[key] = translation;
    }
    return {
      locale,
      name: translations["language.name"] ?? "",
      translations,
    };
  });
  for (const pack of packs) {
    if (!pack.name) errors.push(`Language ${pack.locale} is missing language.name.`);
  }
  return errors.length > 0 ? { status: "invalid", errors: unique(errors) } : { status: "ready", packs };
}

function invalid(error: string): TranslationCsvResult {
  return { status: "invalid", errors: [error] };
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
