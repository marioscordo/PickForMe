import type {
  MenuExtractionConfidence,
  MenuExtractionItem,
  MenuExtractionResult
} from "./types";
import { applyCategoryRoleMetadataToDish } from "../categoryRoleRules";
import { isMenuMarkerLine } from "../menuMarkers";
import htmlCategoryTaxonomy from "./htmlCategoryTaxonomy.json";
import type {
  Dish,
  DishRole,
  MealType,
  SubstanceLevel
} from "../../types/menu";

type PendingHtmlDish = {
  title: string;
  descriptionParts: string[];
  sourceParts: string[];
  category?: string;
};

type HtmlCategoryClassification = {
  dishRole: DishRole;
  mealType: MealType;
  substanceLevel: SubstanceLevel;
  isMainCourseCandidate: boolean;
  isLightDishCandidate: boolean;
  confidence: number;
};

const PRICE_SCAN_PATTERN = /(?:\u20ac\s*)?\d{1,3}(?:[.,]\d{2})(?:\s*(?:\u20ac|eur|euro))?/gi;
const PRICE_LINE_PATTERN = /^(?:\u20ac\s*)?\d{1,3}(?:[.,]\d{2})(?:\s*(?:\u20ac|eur|euro))?$/i;
const CURRENCY_ONLY_PATTERN = /^(?:\u20ac|eur|euro)$/i;
const CATEGORY_CLASSIFICATIONS = htmlCategoryTaxonomy.categories as Record<string, HtmlCategoryClassification>;
const CATEGORY_TERMS = new Set(Object.keys(CATEGORY_CLASSIFICATIONS));

export async function extractHtmlMenuFromUrl(value: string): Promise<MenuExtractionResult | null> {
  let url: URL;

  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return null;
  }

  let response: Response;

  try {
    response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "User-Agent": "GustaroAI/1.0 HTML Menu Extractor",
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.3"
      }
    });
  } catch {
    return null;
  }

  if (!response.ok) {
    return null;
  }

  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";

  if (contentType && !contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
    return null;
  }

  return extractHtmlMenuFromHtml(await response.text());
}

export function extractHtmlMenuFromHtml(html: string): MenuExtractionResult {
  const lines = htmlToLines(html);
  const warnings: string[] = [];
  const fragments: string[] = [];
  const items: MenuExtractionItem[] = [];
  let pending: PendingHtmlDish | null = null;
  let currentCategory: string | undefined;

  const rememberFragment = (line: string) => {
    if (fragments.length >= 80 || isNoiseLine(line) || isAllergenCodeLine(line)) {
      return;
    }

    if (
      parseNumberedTitle(line) ||
      PRICE_LINE_PATTERN.test(line) ||
      extractLastPrice(line) ||
      isCategoryLine(line) ||
      pending
    ) {
      fragments.push(line);
    }
  };

  const finishPending = (price: string, priceLine: string) => {
    if (!pending) {
      return;
    }

    if (isZeroPrice(price)) {
      warnings.push(`Skipped zero-price HTML menu item: ${pending.title}`);
      pending = null;
      return;
    }

    const description = cleanDescription(pending.descriptionParts.join(" "));
    const classification = classifyHtmlMenuCategory(pending.category);

    items.push({
      title: pending.title,
      description: description || undefined,
      price: normalizePrice(price),
      category: pending.category,
      sourceCategory: pending.category,
      sourceFormat: "html",
      ...classification,
      confidence: 0.9,
      sourceText: [...pending.sourceParts, priceLine].join(" ").replace(/\s+/g, " ").trim()
    });

    pending = null;
  };

  for (const line of lines) {
    if (isNoiseLine(line)) {
      pending = null;
      continue;
    }

    if (CURRENCY_ONLY_PATTERN.test(line)) {
      continue;
    }

    if (isAllergenCodeLine(line)) {
      continue;
    }

    rememberFragment(line);

    const standalonePrice = line.match(PRICE_LINE_PATTERN)?.[0];

    if (standalonePrice) {
      finishPending(standalonePrice, line);
      continue;
    }

    const inlinePrice = extractLastPrice(line);

    if (inlinePrice) {
      const namePart = line.slice(0, inlinePrice.index).trim();

      if (namePart.length >= 3 && !isNoiseLine(namePart)) {
        const parsedTitle = parseNumberedTitle(namePart) ?? namePart;
        const { title, description } = splitInlineTitleAndDescription(cleanDishTitle(parsedTitle));

        if (isZeroPrice(inlinePrice.raw)) {
          warnings.push(`Skipped zero-price HTML menu item: ${title}`);
          pending = null;
          continue;
        }

        if (isSafeDishTitle(title)) {
          const classification = classifyHtmlMenuCategory(currentCategory);

          items.push({
            title,
            description,
            price: normalizePrice(inlinePrice.raw),
            category: currentCategory,
            sourceCategory: currentCategory,
            sourceFormat: "html",
            ...classification,
            confidence: 0.85,
            sourceText: line
          });
        }
      }

      pending = null;
      continue;
    }

    if (isCategoryLine(line)) {
      currentCategory = line;
      pending = null;
      continue;
    }

    const numberedTitle = parseNumberedTitle(line);

    if (numberedTitle) {
      const title = cleanDishTitle(numberedTitle);

      pending = isSafeDishTitle(title)
        ? {
            title,
            descriptionParts: [],
            sourceParts: [line],
            category: currentCategory
          }
        : null;

      continue;
    }

    if (pending) {
      if (!isLikelyDescriptionNoise(line)) {
        pending.descriptionParts.push(line);
        pending.sourceParts.push(line);
      }

      continue;
    }

    if (currentCategory && looksLikeStandaloneDishTitle(line)) {
      pending = {
        title: cleanDishTitle(line),
        descriptionParts: [],
        sourceParts: [line],
        category: currentCategory
      };
    }
  }

  const uniqueItems = dedupeItems(items);
  const confidence = getResultConfidence(uniqueItems);

  if (uniqueItems.length === 0) {
    warnings.push("No safe HTML menu items found.");
  }

  return {
    sourceFormat: "html",
    items: uniqueItems,
    confidence,
    warnings,
    fragments: dedupeStrings(fragments).slice(0, 80)
  };
}

export function htmlMenuExtractionToMenuText(result: MenuExtractionResult): string {
  return result.items
    .map((item) => [
      item.title,
      item.description,
      item.price
    ].filter(Boolean).join(" - "))
    .join("\n");
}

export function htmlMenuExtractionToDishes(result: MenuExtractionResult): Dish[] {
  return result.items.map((item, index) => {
    const sourceCategory = item.sourceCategory ?? item.category;

    return applyCategoryRoleMetadataToDish({
      id: `dish_${String(index + 1).padStart(3, "0")}`,
      nameOriginal: item.title,
      descriptionOriginal: item.description,
      price: parsePrice(item.price),
      category: sourceCategory,
      sourceFormat: item.sourceFormat,
      sourceCategory,
      dishRole: item.dishRole,
      mealType: item.mealType,
      substanceLevel: item.substanceLevel,
      isMainCourseCandidate: item.isMainCourseCandidate,
      isLightDishCandidate: item.isLightDishCandidate,
      classificationConfidence: item.classificationConfidence,
      sourceLine: item.sourceText
    });
  });
}

function htmlToLines(html: string): string[] {
  return decodeHtmlEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
      .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
      .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
      .replace(/<header[\s\S]*?<\/header>/gi, " ")
      .replace(/<aside[\s\S]*?<\/aside>/gi, " ")
      .replace(/<form[\s\S]*?<\/form>/gi, " ")
      .replace(/<\s*(?:br|hr)\b[^>]*\/?>/gi, "\n")
      .replace(/<\/(?:p|div|li|tr|td|th|h1|h2|h3|h4|section|article|span|strong|em)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  )
    .split(/\r?\n/)
    .map(cleanLine)
    .filter((line) => line.length > 0 && line.length <= 240);
}

function cleanLine(value: string) {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => {
      const point = Number.parseInt(code, 16);
      return Number.isFinite(point) && point >= 0 && point <= 0x10ffff ? String.fromCodePoint(point) : "";
    })
    .replace(/&#(\d+);/g, (_, code: string) => {
      const point = Number.parseInt(code, 10);
      return Number.isFinite(point) && point >= 0 && point <= 0x10ffff ? String.fromCodePoint(point) : "";
    })
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&euro;/gi, "\u20ac")
    .replace(/&auml;/gi, "ae")
    .replace(/&ouml;/gi, "oe")
    .replace(/&uuml;/gi, "ue")
    .replace(/&Auml;/gi, "Ae")
    .replace(/&Ouml;/gi, "Oe")
    .replace(/&Uuml;/gi, "Ue")
    .replace(/&szlig;/gi, "ss");
}

function extractLastPrice(line: string): { raw: string; index: number } | null {
  const matches = [...line.matchAll(PRICE_SCAN_PATTERN)];
  const last = matches[matches.length - 1];

  if (!last?.[0] || typeof last.index !== "number") {
    return null;
  }

  const tail = line.slice(last.index + last[0].length).trim();

  if (tail && !/^[).,;:]*$/.test(tail)) {
    return null;
  }

  return {
    raw: last[0],
    index: last.index
  };
}

function parseNumberedTitle(line: string) {
  const match = line.match(/^\d{1,3}\.\s*(.+)$/);
  return match?.[1]?.trim();
}

function splitInlineTitleAndDescription(value: string): { title: string; description?: string } {
  const separators = [" - ", " – ", " — ", " mit ", " in ", " an "];
  const lower = value.toLowerCase();

  for (const separator of separators) {
    const index = lower.indexOf(separator);

    if (index > 2) {
      return {
        title: cleanDishTitle(value.slice(0, index)),
        description: cleanDescription(value.slice(index))
      };
    }
  }

  return {
    title: cleanDishTitle(value)
  };
}

function cleanDishTitle(value: string) {
  return value
    .replace(/^\d{1,3}\.\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanDescription(value: string) {
  return value
    .replace(/\s+/g, " ")
    .trim();
}

function normalizePrice(value: string) {
  const cleaned = value.replace(/\s+/g, " ").trim();
  return /(?:\u20ac|eur|euro)/i.test(cleaned) ? cleaned : `${cleaned} \u20ac`;
}

function parsePrice(value: string | undefined) {
  const match = value?.match(/\d{1,3}(?:[.,]\d{2})?/);

  if (!match?.[0]) {
    return undefined;
  }

  const parsed = Number(match[0].replace(",", "."));

  return Number.isFinite(parsed) ? parsed : undefined;
}

function isZeroPrice(value: string) {
  const match = value.match(/\d{1,3}(?:[.,]\d{2})/);
  const parsed = match ? Number(match[0].replace(",", ".")) : Number.NaN;
  return Number.isFinite(parsed) && parsed === 0;
}

function isCategoryLine(line: string) {
  if (line.length < 3 || line.length > 40 || PRICE_SCAN_PATTERN.test(line) || parseNumberedTitle(line)) {
    PRICE_SCAN_PATTERN.lastIndex = 0;
    return false;
  }

  PRICE_SCAN_PATTERN.lastIndex = 0;
  const normalized = normalizeForMatching(line);

  if (CATEGORY_TERMS.has(normalized)) {
    return true;
  }

  return /^[\p{Lu}\s&/-]+$/u.test(line) && line.length <= 28;
}

function isNoiseLine(line: string) {
  const normalized = normalizeForMatching(line);

  if (/@/.test(line) || /\b\d{4,5}\b/.test(line)) {
    return true;
  }

  if (/^\d{1,2}[:.]\d{2}\s*[-–]\s*\d{1,2}[:.]\d{2}$/.test(line.trim())) {
    return true;
  }

  if (/\b(?:tel|telefon|phone|fax)\b/i.test(line)) {
    return true;
  }

  if (/\b(?:strasse|str|street|allee|platz|weg|road|via)\b.*\d/i.test(normalized)) {
    return true;
  }

  return [
    "abholung",
    "adresse",
    "agb",
    "bestell",
    "cart",
    "cookie",
    "copyright",
    "datenschutz",
    "delivery",
    "footer",
    "impressum",
    "kontakt",
    "liefer",
    "mindesbestellwert",
    "navigation",
    "oeffnungszeiten",
    "opening hours",
    "prinzess luise",
    "privacy",
    "reserv",
    "social media",
    "skip to content",
    "warenkorb",
    "zum inhalt springen"
  ].some((term) => normalized.includes(term));
}

function isLikelyDescriptionNoise(line: string) {
  return isNoiseLine(line) || CURRENCY_ONLY_PATTERN.test(line) || isAllergenCodeLine(line) || isCategoryLine(line);
}

function isAllergenCodeLine(line: string) {
  return isMenuMarkerLine(line);
}

function looksLikeStandaloneDishTitle(line: string) {
  if (line.length < 4 || line.length > 90 || isCategoryLine(line) || isNoiseLine(line)) {
    return false;
  }

  if (/^(?:mit|in|an|auf|served|with|tomaten|kalbfleisch)\b/i.test(line)) {
    return false;
  }

  return /^\p{Lu}/u.test(line);
}

function isSafeDishTitle(title: string) {
  if (title.length < 3 || title.length > 90) {
    return false;
  }

  return !isNoiseLine(title) && !PRICE_LINE_PATTERN.test(title) && !CURRENCY_ONLY_PATTERN.test(title);
}

function classifyHtmlMenuCategory(category: string | undefined) {
  const key = normalizeForMatching(category ?? "");
  const classification = CATEGORY_CLASSIFICATIONS[key];

  return classification
    ? {
        dishRole: classification.dishRole,
        mealType: classification.mealType,
        substanceLevel: classification.substanceLevel,
        isMainCourseCandidate: classification.isMainCourseCandidate,
        isLightDishCandidate: classification.isLightDishCandidate,
        classificationConfidence: classification.confidence
      }
    : {
        dishRole: "unknown" as const,
        mealType: "unknown" as const,
        substanceLevel: "unknown" as const,
        isMainCourseCandidate: false,
        isLightDishCandidate: false,
        classificationConfidence: 0
      };
}

function dedupeItems(items: MenuExtractionItem[]) {
  const seen = new Set<string>();

  return items.filter((item) => {
    const key = normalizeForMatching(`${item.title} ${item.price ?? ""}`);

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function dedupeStrings(values: string[]) {
  const seen = new Set<string>();

  return values.filter((value) => {
    const key = normalizeForMatching(value);

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function getResultConfidence(items: MenuExtractionItem[]): MenuExtractionConfidence {
  if (items.length >= 3) {
    return "high";
  }

  if (items.length > 0) {
    return "medium";
  }

  return "low";
}

function normalizeForMatching(value: string) {
  return value
    .toLowerCase()
    .replace(/ß/g, "ss")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
