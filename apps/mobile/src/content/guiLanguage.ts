import { getLocales } from "expo-localization";
import type { GuiLanguage } from "./mobileContent";

export function resolveGuiLanguageFromDevice(): GuiLanguage {
  const [firstLocale] = getLocales();

  return resolveSupportedGuiLanguage([firstLocale?.languageTag, firstLocale?.languageCode]) ?? "en-US";
}

export function resolveSupportedGuiLanguage(locales: Array<string | null | undefined>): GuiLanguage | undefined {
  const normalized = normalizeLocale(locales.find((locale) => Boolean(locale?.trim())));

  if (normalized.startsWith("de")) return "de-DE";
  if (normalized.startsWith("en")) return "en-US";

  return undefined;
}

function normalizeLocale(locale: string | null | undefined) {
  return (locale ?? "").replace(/_/g, "-").trim().toLowerCase();
}
