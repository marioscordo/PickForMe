import { NativeModules, Platform } from "react-native";
import type { GuiLanguage } from "./mobileContent";

export function resolveGuiLanguageFromDevice(): GuiLanguage {
  return resolveSupportedGuiLanguage(getDeviceLocaleCandidates()) ?? "en-US";
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

function getDeviceLocaleCandidates() {
  const settings = NativeModules.SettingsManager?.settings as
    | {
        AppleLanguages?: string[];
        AppleLocale?: string;
      }
    | undefined;
  const androidLocale =
    typeof NativeModules.I18nManager?.localeIdentifier === "string"
      ? NativeModules.I18nManager.localeIdentifier
      : undefined;

  return Platform.OS === "ios"
    ? [settings?.AppleLanguages?.[0], settings?.AppleLocale, androidLocale]
    : [androidLocale, settings?.AppleLanguages?.[0], settings?.AppleLocale];
}
