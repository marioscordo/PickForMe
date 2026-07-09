import { NativeModules, Platform, Settings } from "react-native";
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
  const settingsAppleLanguages = Settings.get("AppleLanguages");
  const settingsPrimaryLanguage =
    Array.isArray(settingsAppleLanguages) && typeof settingsAppleLanguages[0] === "string"
      ? settingsAppleLanguages[0]
      : undefined;
  const settingsAppleLocale = Settings.get("AppleLocale");
  const settingsLocale = typeof settingsAppleLocale === "string" ? settingsAppleLocale : undefined;

  return Platform.OS === "ios"
    ? [settingsPrimaryLanguage, settingsLocale, settings?.AppleLanguages?.[0], settings?.AppleLocale, androidLocale]
    : [androidLocale, settingsPrimaryLanguage, settingsLocale, settings?.AppleLanguages?.[0], settings?.AppleLocale];
}
