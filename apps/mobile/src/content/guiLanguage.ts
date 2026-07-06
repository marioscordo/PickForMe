import { NativeModules, Platform } from "react-native";
import type { GuiLanguage } from "./mobileContent";

type I18nManagerSettings = {
  localeIdentifier?: string;
};

type SettingsManagerSettings = {
  AppleLanguages?: string[];
  AppleLocale?: string;
};

export function resolveGuiLanguageFromDevice(): GuiLanguage {
  const preferredDeviceLanguage = getFirstPreferredDeviceLanguage();
  const normalized = preferredDeviceLanguage.toLowerCase();

  if (normalized.startsWith("de")) return "de-DE";
  if (normalized.startsWith("en")) return "en-US";

  return "en-US";
}

function getFirstPreferredDeviceLanguage() {
  if (Platform.OS === "ios") {
    const settings = (NativeModules.SettingsManager?.settings ?? {}) as SettingsManagerSettings;
    const firstPreferredLanguage = settings.AppleLanguages?.[0];

    return firstPreferredLanguage || settings.AppleLocale || "";
  }

  const i18nSettings = (NativeModules.I18nManager ?? {}) as I18nManagerSettings;
  return i18nSettings.localeIdentifier || "";
}
