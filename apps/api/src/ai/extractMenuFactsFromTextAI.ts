import OpenAI from "openai";
import { z } from "zod";
import type { MenuFacts, MenuItemFact, MenuUnitFact } from "../types/menuFacts";

const SUMMARY_LABEL = "PickForMe two-step text AI summary";

const MENU_ITEM_TYPES = ["dish", "course", "drink", "unknown"] as const;
const MENU_ITEM_ORDERABILITIES = ["standalone", "part_of_menu", "unclear"] as const;
const MENU_UNIT_TYPES = ["whole_menu", "sharing_menu"] as const;
const MENU_UNIT_ORDERABILITIES = ["standalone"] as const;
const GENERIC_MENU_UNIT_TITLES = [
  "degustationsmenu",
  "degustationsmenue",
  "set menu",
  "set menue",
  "tasting menu",
  "sharing menu",
  "gesamtmenu",
  "gesamtmenue",
  "menu",
  "menue"
];

const RawMenuFactsSchema = z.object({
  menuType: z.unknown().optional(),
  items: z.preprocess((value) => Array.isArray(value) ? value : [], z.array(z.unknown())),
  menuUnits: z.preprocess((value) => Array.isArray(value) ? value : [], z.array(z.unknown()))
});

type RawMenuFacts = z.infer<typeof RawMenuFactsSchema>;
type RawObject = Record<string, unknown>;

export async function extractMenuFactsFromTextAI(
  menuText: string,
  options: { signal?: AbortSignal; userLocale?: string } = {}
): Promise<MenuFacts> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY fehlt.");
  }

  const client = new OpenAI({ apiKey });

  const completion = await client.chat.completions.create(
    {
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: buildSystemPrompt(options.userLocale)
        },
        {
          role: "user",
          content: buildUserPrompt(menuText)
        }
      ]
    },
    options.signal ? { signal: options.signal } : undefined
  );

  const content = completion.choices[0]?.message?.content;

  if (!content) {
    throw new Error("Die KI hat keine Speisekarten-Fakten geliefert.");
  }

  const parsedJson = JSON.parse(content) as unknown;
  const parsedResult = RawMenuFactsSchema.safeParse(parsedJson);
  const rawFacts = parsedResult.success
    ? parsedResult.data
    : {
        menuType: undefined,
        items: [],
        menuUnits: []
      };

  return validateMenuFacts(rawFacts, menuText);
}

function buildSystemPrompt(userLocale?: string) {
  const targetLocale = normalizeTargetLocale(userLocale);
  const targetLanguage = getLanguageNameForLocale(targetLocale);

  return [
    "Du extrahierst reine Speisekarten-Fakten fuer PickForMe.",
    "Du gibst keine Empfehlung, kein Ranking und keinen Concierge-Text aus.",
    "Nutze ausschliesslich Fakten aus dem geladenen Speisekartentext.",
    "Nutze keine externen Restaurantinformationen und keine Vermutungen.",
    "Erfinde keine Namen, Preise, Zutaten, Beschreibungen oder Bestellbarkeit.",
    `Sprache fuer nutzerseitige Gerichtsanzeigen: ${targetLanguage} (${targetLocale}).`,
    "nameOriginal muss ein exakt sichtbarer Originalname aus dem Text sein.",
    "MenuUnit titleOriginal muss ein exakt sichtbarer Originaltitel, Abschnittstitel oder klar sichtbarer Menue-Titel aus dem Text sein.",
    "Erzeuge keine generischen frei erfundenen MenuUnit-Titel wie Degustationsmenue, wenn dieser Begriff nicht sichtbar ist.",
    "Alle items und menuUnits sind Speisekartenfakten; behandle nameOriginal, titleOriginal, descriptionOriginal und evidence als Gerichtskontext.",
    "translatedName ist nur eine nuechterne nutzerseitige Gerichtsanzeige in der Sprache fuer nutzerseitige Gerichtsanzeigen, kein Marketingtext.",
    "Leite translatedName aus dem sichtbaren Originalnamen ab und nutze descriptionOriginal oder evidence nur, um eine Fehluebersetzung zu vermeiden.",
    "Kulinarische Eigennamen duerfen stehen bleiben, muessen aber in der Zielsprache knapp erklaert werden, wenn der sichere Gerichtskontext das erlaubt.",
    "Uebersetze Zubereitungsart, Herkunfts- oder Stilangaben, Beilagen und verbindende Woerter in die Zielsprache, auch wenn der kulinarische Eigenname stehen bleibt.",
    "translatedName darf nur identisch mit nameOriginal oder titleOriginal sein, wenn keine sichere Uebersetzung oder Erklaerung moeglich ist.",
    "descriptionOriginal muss aus sichtbarem Speisekartentext stammen.",
    "descriptionOriginal darf nicht uebersetzt, zusammengefasst, bewertet, interpretiert oder frei ergaenzt werden.",
    "priceRaw muss den Preis exakt roh aus dem Text uebernehmen, inklusive Waehrung oder Symbol, wenn sichtbar.",
    "Wenn kein Preis sichtbar ist, lasse priceRaw weg.",
    "Degustationsmenues, Set-Menues und Sharing-Menues nur erfassen, wenn ein konkreter sichtbarer Titel, Abschnitt oder eine klare Struktur im Text vorhanden ist.",
    "Wenn ein 7-Gaenge-, 9-Gaenge-, Set- oder Sharing-Menue sichtbar ist, erfasse es als MenuUnit.",
    "priceRaw fuer MenuUnit muss den sichtbaren Gesamtpreis exakt roh uebernehmen, falls ein Gesamtpreis sichtbar ist.",
    "Keine Preisableitung, keine Preisnormalisierung und keine Waehrungsumrechnung.",
    "Erfasse solche bestellbaren Gesamtmenues als menuUnits.",
    "Einzelne Gaenge eines Menues als itemType course und orderability part_of_menu markieren, wenn sie nicht klar separat bestellbar sind.",
    "Normale separat bestellbare Speisen als itemType dish und orderability standalone markieren.",
    "Getraenke als itemType drink markieren.",
    "Wenn Bestellbarkeit unklar ist, orderability unclear verwenden.",
    "evidence muss ein kurzer Originalausschnitt aus dem Speisekartentext sein.",
    "Gib keine leeren item-Objekte aus.",
    "Wenn ein Eintrag keinen sichtbaren Namen hat, nimm ihn nicht in items auf.",
    "Wenn itemType unklar ist, aber ein sichtbarer Name vorhanden ist, verwende itemType unknown.",
    "Gib keine Platzhalter-Items aus.",
    "Antworte ausschliesslich als valides JSON ohne Markdown.",
    "JSON-Format:",
    "{",
    '  "menuType": "optional: sichtbarer oder klar ableitbarer Kartentyp",',
    '  "items": [',
    "    {",
    '      "id": "item_001",',
    '      "itemType": "dish | course | drink | unknown",',
    '      "nameOriginal": "exakter sichtbarer Originalname",',
    '      "translatedName": "nuechterne nutzerseitige Gerichtsanzeige in der Sprache fuer nutzerseitige Gerichtsanzeigen",',
    '      "descriptionOriginal": "Originalbeschreibung falls sichtbar",',
    '      "priceRaw": "exakter Rohpreis falls sichtbar",',
    '      "orderability": "standalone | part_of_menu | unclear",',
    '      "parentMenuUnitId": "unit_001 falls Teil eines Gesamtmenues",',
    '      "evidence": "Originalausschnitt aus dem Speisekartentext"',
    "    }",
    "  ],",
    '  "menuUnits": [',
    "    {",
    '      "id": "unit_001",',
    '      "itemType": "whole_menu | sharing_menu",',
    '      "titleOriginal": "exakter sichtbarer Menue- oder Abschnittstitel",',
    '      "translatedName": "nuechterne nutzerseitige Gerichtsanzeige in der Sprache fuer nutzerseitige Gerichtsanzeigen",',
    '      "descriptionOriginal": "Originalbeschreibung oder Struktur falls sichtbar",',
    '      "priceRaw": "exakter Gesamtpreis falls sichtbar",',
    '      "includedItemIds": ["item_001"],',
    '      "orderability": "standalone",',
    '      "evidence": "Originalausschnitt aus dem Speisekartentext"',
    "    }",
    "  ]",
    "}"
  ].join("\n");
}

function normalizeTargetLocale(value: string | undefined) {
  const locale = value?.trim();

  return locale ? locale.slice(0, 40) : "de-DE";
}

function getLanguageNameForLocale(locale: string) {
  const languageCode = locale.toLowerCase().split(/[-_]/)[0];

  switch (languageCode) {
    case "de":
      return "German";
    case "en":
      return "English";
    case "es":
      return "Spanish";
    case "fr":
      return "French";
    case "it":
      return "Italian";
    case "nl":
      return "Dutch";
    case "pl":
      return "Polish";
    case "pt":
      return "Portuguese";
    default:
      return locale;
  }
}

function buildUserPrompt(menuText: string) {
  return [
    "Extrahiere Speisekarten-Fakten aus diesem Text.",
    "Keine persoenliche Bewertung, keine Empfehlung, keine frei formulierten Namen.",
    "",
    "Speisekartentext:",
    menuText
  ].join("\n");
}

function validateMenuFacts(result: RawMenuFacts, menuText: string): MenuFacts {
  const normalizedMenu = normalize(menuText);
  const seenUnitIds = new Set<string>();
  const menuUnits: MenuUnitFact[] = [];

  for (const [index, rawUnit] of result.menuUnits.entries()) {
    const unit = toMenuUnitFact(rawUnit, index);

    if (!unit) {
      continue;
    }

    if (seenUnitIds.has(unit.id)) {
      continue;
    }

    if (isGenericMenuUnitTitle(unit.titleOriginal) && !isVisibleText(unit.titleOriginal, normalizedMenu)) {
      continue;
    }

    if (!isVisibleFact(unit.titleOriginal, unit.evidence, normalizedMenu)) {
      continue;
    }

    const sourceBoundUnit = withSourceBoundDetails(unit, normalizedMenu);

    seenUnitIds.add(unit.id);
    menuUnits.push(sourceBoundUnit);
  }

  const knownUnitIds = new Set(menuUnits.map((unit) => unit.id));
  const seenItemIds = new Set<string>();
  const items: MenuItemFact[] = [];

  for (const [index, rawItem] of result.items.entries()) {
    const item = toMenuItemFact(rawItem, index);

    if (!item) {
      continue;
    }

    if (seenItemIds.has(item.id)) {
      continue;
    }

    if (!isVisibleFact(item.nameOriginal, item.evidence, normalizedMenu)) {
      continue;
    }

    if (item.parentMenuUnitId && !knownUnitIds.has(item.parentMenuUnitId)) {
      continue;
    }

    const sourceBoundItem = withSourceBoundDetails(item, normalizedMenu);

    seenItemIds.add(item.id);
    items.push(sourceBoundItem);
  }

  const knownItemIds = new Set(items.map((item) => item.id));
  const validMenuUnits = menuUnits.map((unit) => ({
    ...unit,
    includedItemIds: unit.includedItemIds?.filter((itemId) => knownItemIds.has(itemId))
  }));

  if (process.env.NODE_ENV !== "production") {
    console.log(SUMMARY_LABEL, {
      stage: "menu_facts_filter",
      rawItems: result.items.length,
      validItems: items.length,
      droppedInvalidItems: result.items.length - items.length,
      rawMenuUnits: result.menuUnits.length,
      validMenuUnits: validMenuUnits.length,
      droppedInvalidMenuUnits: result.menuUnits.length - validMenuUnits.length
    });
  }

  return {
    menuType: toNonEmptyString(result.menuType),
    items,
    menuUnits: validMenuUnits
  };
}

function toMenuItemFact(value: unknown, index: number): MenuItemFact | null {
  const object = toRawObject(value);

  if (!object) {
    return null;
  }

  const itemType = toEnum(object.itemType, MENU_ITEM_TYPES);
  const nameOriginal = toNonEmptyString(object.nameOriginal);
  const orderability = toEnum(object.orderability, MENU_ITEM_ORDERABILITIES);
  const evidence = toNonEmptyString(object.evidence);

  if (!itemType || !nameOriginal || !orderability || !evidence) {
    return null;
  }

  return {
    id: toNonEmptyString(object.id) ?? `item_${String(index + 1).padStart(3, "0")}`,
    itemType,
    nameOriginal,
    translatedName: toNonEmptyString(object.translatedName),
    descriptionOriginal: toNonEmptyString(object.descriptionOriginal),
    priceRaw: toNonEmptyString(object.priceRaw),
    orderability,
    parentMenuUnitId: toNonEmptyString(object.parentMenuUnitId),
    evidence
  };
}

function toMenuUnitFact(value: unknown, index: number): MenuUnitFact | null {
  const object = toRawObject(value);

  if (!object) {
    return null;
  }

  const itemType = toEnum(object.itemType, MENU_UNIT_TYPES);
  const titleOriginal = toNonEmptyString(object.titleOriginal);
  const orderability = toEnum(object.orderability, MENU_UNIT_ORDERABILITIES);
  const evidence = toNonEmptyString(object.evidence);

  if (!itemType || !titleOriginal || orderability !== "standalone" || !evidence) {
    return null;
  }

  return {
    id: toNonEmptyString(object.id) ?? `unit_${String(index + 1).padStart(3, "0")}`,
    itemType,
    titleOriginal,
    translatedName: toNonEmptyString(object.translatedName),
    descriptionOriginal: toNonEmptyString(object.descriptionOriginal),
    priceRaw: toNonEmptyString(object.priceRaw),
    includedItemIds: toStringArray(object.includedItemIds),
    orderability: "standalone",
    evidence
  };
}

function isVisibleFact(nameOrTitle: string, evidence: string, normalizedMenu: string): boolean {
  return isVisibleText(nameOrTitle, normalizedMenu) || isVisibleText(evidence, normalizedMenu);
}

function withSourceBoundDetails<T extends MenuItemFact | MenuUnitFact>(fact: T, normalizedMenu: string): T {
  return {
    ...fact,
    descriptionOriginal: fact.descriptionOriginal && isVisibleText(fact.descriptionOriginal, normalizedMenu)
      ? fact.descriptionOriginal
      : undefined,
    priceRaw: fact.priceRaw && isVisibleText(fact.priceRaw, normalizedMenu)
      ? fact.priceRaw
      : undefined
  };
}

function isVisibleText(value: string, normalizedMenu: string): boolean {
  const normalizedValue = normalize(value);

  return Boolean(normalizedValue && normalizedMenu.includes(normalizedValue));
}

function isGenericMenuUnitTitle(title: string) {
  const normalizedTitle = normalize(title);

  return GENERIC_MENU_UNIT_TITLES.some((genericTitle) => normalizedTitle === normalize(genericTitle));
}

function toRawObject(value: unknown): RawObject | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as RawObject
    : null;
}

function toNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function toEnum<const T extends string>(value: unknown, allowedValues: readonly T[]): T | undefined {
  const normalizedValue = toNonEmptyString(value)?.toLowerCase();

  return allowedValues.find((allowedValue) => allowedValue === normalizedValue);
}

function toStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const strings = value
    .map(toNonEmptyString)
    .filter((itemId): itemId is string => Boolean(itemId));

  return strings.length > 0 ? strings : undefined;
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/\u00df/g, "ss")
    .replace(/\u00e6/g, "ae")
    .replace(/\u0153/g, "oe")
    .replace(/\u00f8/g, "o")
    .replace(/\u0142/g, "l")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
