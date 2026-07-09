import type { TwoStepSourceKind } from "../ai/twoStepRecommendationSchemas";
import type { MenuExtractionItem, MenuExtractionResult } from "./extraction/types";

export type RecommendationSearchSpaceResult = {
  text: string;
  originalText: string;
  restrictionApplied: boolean;
  restrictionReason?: "daily_menu_today" | "weekly_menu_today";
  hasReliableAvailabilitySections: boolean;
  confidence: "high" | "medium" | "low";
  includedItemCount?: number;
  excludedItemCount?: number;
  diagnostics?: {
    detectedSectionCount: number;
    todaySectionCount: number;
    sourceKind: TwoStepSourceKind;
  };
};

export function prepareRecommendationSearchSpace({
  sourceKind,
  menuText,
  htmlMenuExtraction,
  timezone = "Europe/Berlin",
  now = new Date()
}: {
  sourceKind: TwoStepSourceKind;
  menuText: string;
  htmlMenuExtraction?: MenuExtractionResult | null;
  restaurantCountryHint?: string;
  timezone?: string;
  now?: Date;
}): RecommendationSearchSpaceResult {
  const originalText = menuText;

  if (!originalText.trim() || sourceKind === "unknown") {
    return noRestriction(originalText, sourceKind);
  }

  if (sourceKind === "html" && htmlMenuExtraction?.items.length) {
    const htmlResult = prepareFromHtmlItems({
      originalText,
      items: htmlMenuExtraction.items,
      sourceKind,
      timezone,
      now
    });

    if (htmlResult.restrictionApplied) {
      return htmlResult;
    }
  }

  return prepareFromText({
    originalText,
    sourceKind,
    timezone,
    now
  });
}

type DaySection = {
  heading: string;
  weekday?: Weekday;
  dateHint?: DateHint;
  itemLines: string[];
};

type DateHint = {
  year?: number;
  month: number;
  day: number;
};

type Weekday = "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";

const WEEKDAY_ALIASES: Record<Weekday, string[]> = {
  monday: ["montag", "monday", "lunedi", "lundi", "lunes"],
  tuesday: ["dienstag", "tuesday", "martedi", "mardi", "martes"],
  wednesday: ["mittwoch", "wednesday", "mercoledi", "mercredi", "miercoles"],
  thursday: ["donnerstag", "thursday", "giovedi", "jeudi", "jueves"],
  friday: ["freitag", "friday", "venerdi", "vendredi", "viernes"],
  saturday: ["samstag", "saturday", "sabato", "samedi", "sabado"],
  sunday: ["sonntag", "sunday", "domenica", "dimanche", "domingo"]
};

const NORMAL_CATEGORY_TERMS = [
  "antipasti",
  "dessert",
  "desserts",
  "dolci",
  "drinks",
  "fisch",
  "fleisch",
  "getraenke",
  "getranke",
  "hauptgerichte",
  "pasta",
  "pizza",
  "primi",
  "salate",
  "salads",
  "secondi",
  "soup",
  "soups",
  "suppen",
  "vorspeisen"
];

const NON_MENU_SECTION_TERMS = [
  "event",
  "events",
  "geschlossen",
  "oeffnungszeiten",
  "offnungszeiten",
  "opening hours",
  "reservierung",
  "ruhetag",
  "veranstaltung"
];

const SUPPORTING_AVAILABILITY_TERMS = [
  "menu du jour",
  "mittagstisch",
  "piatto del giorno",
  "tageskarte",
  "tagesmenue",
  "tagesmenu",
  "today",
  "wochenkarte",
  "wochenmenue",
  "wochenmenu"
];

const PRICE_PATTERN = /(?:(?:\u20ac|eur|euro)\s*)?\d{1,3}(?:[.,]\d{2})(?:\s*(?:\u20ac|eur|euro))?/i;

function prepareFromHtmlItems({
  originalText,
  items,
  sourceKind,
  timezone,
  now
}: {
  originalText: string;
  items: MenuExtractionItem[];
  sourceKind: TwoStepSourceKind;
  timezone: string;
  now: Date;
}): RecommendationSearchSpaceResult {
  const sectionsByHeading = new Map<string, DaySection>();

  for (const item of items) {
    const section = parseDaySectionHeading(item.sourceSectionOriginal, now, timezone);

    if (!section) {
      continue;
    }

    const existing = sectionsByHeading.get(section.heading) ?? section;
    const itemText = formatMenuExtractionItem(item);

    if (itemText) {
      existing.itemLines.push(itemText);
    }

    sectionsByHeading.set(section.heading, existing);
  }

  return buildRestrictedResult({
    originalText,
    sourceKind,
    sections: [...sectionsByHeading.values()],
    timezone,
    now
  });
}

function prepareFromText({
  originalText,
  sourceKind,
  timezone,
  now
}: {
  originalText: string;
  sourceKind: TwoStepSourceKind;
  timezone: string;
  now: Date;
}): RecommendationSearchSpaceResult {
  return buildRestrictedResult({
    originalText,
    sourceKind,
    sections: extractDaySectionsFromText(originalText, now, timezone),
    timezone,
    now
  });
}

function buildRestrictedResult({
  originalText,
  sourceKind,
  sections,
  timezone,
  now
}: {
  originalText: string;
  sourceKind: TwoStepSourceKind;
  sections: DaySection[];
  timezone: string;
  now: Date;
}): RecommendationSearchSpaceResult {
  const sectionsWithItems = sections.filter((section) => section.itemLines.length > 0);
  const detectedSectionCount = sections.length;

  if (detectedSectionCount < 2 || sectionsWithItems.length < 2) {
    return noRestriction(originalText, sourceKind, detectedSectionCount);
  }

  if (sections.some((section) => !isDateWeekdayPlausible(section, now, timezone))) {
    return noRestriction(originalText, sourceKind, detectedSectionCount);
  }

  const today = getZonedWeekday(now, timezone);
  const todaySections = sectionsWithItems.filter((section) => isTodaySection(section, today, now, timezone));

  if (todaySections.length !== 1) {
    return noRestriction(originalText, sourceKind, detectedSectionCount, todaySections.length);
  }

  const todaySection = todaySections[0]!;
  const includedItemCount = todaySection.itemLines.length;

  if (includedItemCount < 1) {
    return noRestriction(originalText, sourceKind, detectedSectionCount, todaySections.length);
  }

  const allItemCount = sectionsWithItems.reduce((sum, section) => sum + section.itemLines.length, 0);
  const restrictedText = [todaySection.heading, ...todaySection.itemLines].join("\n").trim();

  if (!restrictedText) {
    return noRestriction(originalText, sourceKind, detectedSectionCount, todaySections.length);
  }

  return {
    text: restrictedText,
    originalText,
    restrictionApplied: true,
    restrictionReason: "weekly_menu_today",
    hasReliableAvailabilitySections: true,
    confidence: "high",
    includedItemCount,
    excludedItemCount: Math.max(0, allItemCount - includedItemCount),
    diagnostics: {
      detectedSectionCount,
      todaySectionCount: todaySections.length,
      sourceKind
    }
  };
}

function extractDaySectionsFromText(value: string, now: Date, timezone: string): DaySection[] {
  const lines = value
    .split(/\r?\n/)
    .map((line) => cleanLine(line))
    .filter(Boolean);
  const sections: DaySection[] = [];
  let current: DaySection | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    const section = parseDaySectionHeading(line, now, timezone);

    if (section) {
      sections.push(section);
      current = section;
      continue;
    }

    if (!current || isNonDishLine(line)) {
      continue;
    }

    const nextLine = lines[index + 1] ? cleanLine(lines[index + 1]!) : "";
    const itemLine = toMenuItemLine(line, nextLine);

    if (itemLine) {
      current.itemLines.push(itemLine);

      if (!PRICE_PATTERN.test(line) && PRICE_PATTERN.test(nextLine)) {
        index += 1;
      }
    }
  }

  return sections;
}

function parseDaySectionHeading(value: string | undefined, now: Date, timezone: string): DaySection | null {
  const heading = cleanLine(value ?? "");

  if (!heading || heading.length > 90) {
    return null;
  }

  const normalized = normalizeForMatching(heading);

  if (
    NORMAL_CATEGORY_TERMS.includes(normalized) ||
    NON_MENU_SECTION_TERMS.some((term) => normalized.includes(term))
  ) {
    return null;
  }

  const weekday = getWeekdayFromLine(normalized);
  const dateHint = getDateHintFromLine(heading);

  if (!weekday && !dateHint) {
    return null;
  }

  if (!weekday && dateHint && !looksLikeStandaloneDateHeading(heading)) {
    return null;
  }

  return {
    heading,
    weekday: weekday ?? getWeekdayFromDateHint(dateHint, now, timezone),
    dateHint,
    itemLines: []
  };
}

function toMenuItemLine(line: string, nextLine: string) {
  if (PRICE_PATTERN.test(line) && looksLikeDishText(line)) {
    return line;
  }

  if (nextLine && PRICE_PATTERN.test(nextLine) && looksLikeDishText(line)) {
    return `${line} - ${nextLine}`;
  }

  return null;
}

function formatMenuExtractionItem(item: MenuExtractionItem) {
  return [
    item.title,
    item.description,
    item.price
  ].filter(Boolean).join(" - ");
}

function isTodaySection(section: DaySection, today: Weekday, now: Date, timezone: string) {
  if (section.dateHint) {
    return isDateHintToday(section.dateHint, now, timezone);
  }

  return section.weekday === today;
}

function isDateWeekdayPlausible(section: DaySection, now: Date, timezone: string) {
  if (!section.dateHint || !section.weekday) {
    return true;
  }

  return getWeekdayFromDateHint(section.dateHint, now, timezone) === section.weekday;
}

function isDateHintToday(dateHint: DateHint, now: Date, timezone: string) {
  const today = getZonedDateParts(now, timezone);
  const year = dateHint.year ?? today.year;

  return year === today.year && dateHint.month === today.month && dateHint.day === today.day;
}

function getWeekdayFromDateHint(dateHint: DateHint | undefined, now: Date, timezone: string): Weekday | undefined {
  if (!dateHint) {
    return undefined;
  }

  const current = getZonedDateParts(now, timezone);
  const date = new Date(Date.UTC(dateHint.year ?? current.year, dateHint.month - 1, dateHint.day, 12));

  return getZonedWeekday(date, timezone);
}

function getDateHintFromLine(value: string): DateHint | undefined {
  const iso = value.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);

  if (iso) {
    return toDateHint(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  }

  const numeric = value.match(/\b(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?\.?\b/);

  if (!numeric) {
    return undefined;
  }

  const rawYear = numeric[3] ? Number(numeric[3]) : undefined;
  const year = rawYear === undefined ? undefined : rawYear < 100 ? 2000 + rawYear : rawYear;

  return toDateHint(year, Number(numeric[2]), Number(numeric[1]));
}

function toDateHint(year: number | undefined, month: number, day: number): DateHint | undefined {
  if (
    (year !== undefined && (year < 2000 || year > 2100)) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return undefined;
  }

  return {
    ...(year === undefined ? {} : { year }),
    month,
    day
  };
}

function getWeekdayFromLine(normalized: string): Weekday | undefined {
  for (const [weekday, aliases] of Object.entries(WEEKDAY_ALIASES) as Array<[Weekday, string[]]>) {
    if (aliases.some((alias) => matchesWord(normalized, alias))) {
      return weekday;
    }
  }

  return undefined;
}

function getZonedDateParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);

  return {
    year: value("year"),
    month: value("month"),
    day: value("day")
  };
}

function getZonedWeekday(date: Date, timezone: string): Weekday {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "long"
  }).format(date).toLowerCase() as Weekday;
}

function looksLikeStandaloneDateHeading(value: string) {
  const trimmed = value.trim();
  return /^\d{4}-\d{1,2}-\d{1,2}$/.test(trimmed) || /^\d{1,2}[./]\d{1,2}\.$/.test(trimmed);
}

function looksLikeDishText(value: string) {
  const normalized = normalizeForMatching(value);

  if (
    value.length < 4 ||
    PRICE_PATTERN.test(value.trim()) && value.trim().replace(PRICE_PATTERN, "").trim().length < 3 ||
    SUPPORTING_AVAILABILITY_TERMS.some((term) => normalized.includes(term)) ||
    NORMAL_CATEGORY_TERMS.includes(normalized) ||
    NON_MENU_SECTION_TERMS.some((term) => normalized.includes(term))
  ) {
    return false;
  }

  return /[\p{L}]/u.test(value);
}

function isNonDishLine(value: string) {
  const normalized = normalizeForMatching(value);
  return !normalized ||
    NORMAL_CATEGORY_TERMS.includes(normalized) ||
    SUPPORTING_AVAILABILITY_TERMS.some((term) => normalized.includes(term)) ||
    NON_MENU_SECTION_TERMS.some((term) => normalized.includes(term));
}

function cleanLine(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeForMatching(value: string) {
  return value
    .toLowerCase()
    .replace(/\u00df/g, "ss")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchesWord(value: string, term: string) {
  return new RegExp(`(?:^|\\s)${escapeRegExp(normalizeForMatching(term))}(?:\\s|$)`).test(value);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function noRestriction(
  originalText: string,
  sourceKind: TwoStepSourceKind,
  detectedSectionCount = 0,
  todaySectionCount = 0
): RecommendationSearchSpaceResult {
  return {
    text: originalText,
    originalText,
    restrictionApplied: false,
    hasReliableAvailabilitySections: false,
    confidence: "low",
    diagnostics: {
      detectedSectionCount,
      todaySectionCount,
      sourceKind
    }
  };
}
