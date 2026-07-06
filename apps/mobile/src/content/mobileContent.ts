import deDEContent from "./mobileContent.de-DE.json";
import enUSContent from "./mobileContent.en-US.json";

export type GuiLanguage = "de-DE" | "en-US";

const contentByLocale = {
  "de-DE": deDEContent,
  "en-US": enUSContent
} as const;

export type MobileContent = typeof deDEContent;

export function getMobileContent(guiLanguage: GuiLanguage = "de-DE"): MobileContent {
  return contentByLocale[guiLanguage] ?? enUSContent;
}

export function formatContent(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replaceAll(`{${key}}`, String(value)),
    template
  );
}
