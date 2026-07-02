import deDEContent from "./mobileContent.de-DE.json";
import { resolveOutputLocale } from "../config/outputLocales";

const contentByLocale = {
  "de-DE": deDEContent
} as const;

export type MobileContent = typeof deDEContent;

export function getMobileContent(outputLocale: string | undefined): MobileContent {
  const locale = resolveOutputLocale(outputLocale);

  return contentByLocale[locale as keyof typeof contentByLocale] ?? deDEContent;
}

export function formatContent(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replaceAll(`{${key}}`, String(value)),
    template
  );
}
