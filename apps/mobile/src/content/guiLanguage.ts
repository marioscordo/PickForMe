import { getLocales } from "expo-localization";
import type { GuiLanguage } from "./mobileContent";

export function resolveGuiLanguageFromDevice(): GuiLanguage {
  const locales = getLocales().flatMap((locale) => [locale.languageTag, locale.languageCode]);

  return resolveSupportedGuiLanguage(locales) ?? "en-US";
}

export function resolveSupportedGuiLanguage(locales: Array<string | null | undefined>): GuiLanguage | undefined {
  for (const locale of locales) {
    const normalized = normalizeLocale(locale);

    if (normalized.startsWith("de")) return "de-DE";
    if (normalized.startsWith("en")) return "en-US";
  }

  return undefined;
}

function normalizeLocale(locale: string | null | undefined) {
  return (locale ?? "").replace(/_/g, "-").trim().toLowerCase();
}
