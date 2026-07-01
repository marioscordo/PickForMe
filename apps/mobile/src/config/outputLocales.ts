export const DEFAULT_OUTPUT_LOCALE = "de-DE";

export const OUTPUT_LOCALES = [
  "de-DE",
  "en-US",
  "en-GB",
  "it-IT",
  "fr-FR",
  "es-ES",
  "nl-NL",
  "pl-PL",
  "pt-PT"
] as const;

export type OutputLocale = (typeof OUTPUT_LOCALES)[number];

export function resolveOutputLocale(value: string | undefined) {
  return isSupportedOutputLocale(value) ? value : DEFAULT_OUTPUT_LOCALE;
}

export function isSupportedOutputLocale(value: string | undefined): value is OutputLocale {
  return OUTPUT_LOCALES.includes(value as OutputLocale);
}
