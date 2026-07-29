import sharp from "sharp";
import { findLinkedMenuImageUrls } from "./findLinkedMenuImageUrls";

// Generische Variante von prepareTildaMenuImageFallback.ts fuer Websites, die
// (anders als Tilda oder pubhtml5) kein erkennbares Plattform-Muster haben,
// deren Speisekarte aber trotzdem als reine Bild-Datei eingebunden ist (z.B.
// eine WordPress-/Avia-Seite mit "speisekarte-1.png", "speisekarte-2.png"
// usw. - Fallanalyse "sonnenalm.de", Juli 2026). findLinkedMenuImageUrls
// erkennt solche Bilder bereits plattformunabhaengig anhand des Dateinamens
// (u.a. "speisekarte" +8, "getraenk"/"wine" -10 - Getraenke-/Weinbilder
// werden also absichtlich ausgeschlossen, das ist hier kein Weinkarten-Fix).
//
// Anders als der Tilda-Fallback (der genau EIN bestes Bild waehlt) werden
// hier ALLE gefundenen, gueltigen Speisen-Bilder mitgegeben: Seiten wie
// sonnenalm.de verteilen ihre Speisekarte auf mehrere separate Bilddateien
// (Speisen, Dessert, Kinderkarte). Ein einzelnes "bestes" Bild wuerde den
// groessten Teil der echten Karte verlieren und damit denselben
// Halluzinations-Anreiz schaffen, den dieser Fallback gerade vermeiden soll.
const MAX_LINKED_MENU_IMAGE_WIDTH = 1280;
// findLinkedMenuImageUrls vergibt Score-Bonuspunkte sowohl fuer
// Speisekarten-Dateinamen ("speisekarte" +8) als auch fuer Gerichte-
// Schlagworte ("fisch" +4 usw.). Auf realen Seiten gibt es oft zusaetzlich
// dekorative Gerichtsfotos, deren Dateiname zufaellig "speisekarte" enthaelt
// (z.B. "speisekarte-fischgericht.jpg" bei sonnenalm.de) und dadurch HOEHER
// bewertet wird als die eigentlichen Speisekarten-Bilder. Ein zu kleines
// Limit wuerde diese echten Speisekarten-Seiten dann verdraengen. 10 (wie
// beim bestehenden pubhtml5-Fallback) laesst genug Spielraum, um auf so
// einer Seite alle "speisekarte"-Treffer mitzunehmen; die KI liest ohnehin
// nur aus Bildern mit echtem Text etwas heraus, ein dekoratives Foto liefert
// schlicht keine Gerichte. Bei sonnenalm.de selbst kommen so schon 10
// positiv bewertete Bilder zusammen (4 echte Speisekarten-Seiten + 6
// dekorative Gerichtsfotos) - 12 laesst etwas Spielraum darueber hinaus.
const MAX_LINKED_MENU_IMAGE_CANDIDATES = 12;
// Woerter, die auf einen echten Speisekarten-ABSCHNITT hindeuten, wenn sie
// als Dateinamen-Suffix stehen (z.B. "speisekarte-dessert.png"). Bewusst
// kurz gehalten auf haeufige deutsche Kartenabschnitte - eine Erweiterung
// ist risikolos, weil diese Liste nur zusaetzliche Serien ERKENNT, nie
// bestehende Bilder ausschliesst, wenn keine Serie gefunden wird.
const MENU_IMAGE_FAMILY_CATEGORY_WORDS = new Set([
  "dessert", "desserts", "nachspeise", "nachspeisen", "suessspeise", "suesspeisen",
  "vorspeise", "vorspeisen", "hauptspeise", "hauptspeisen", "kinder", "kinderkarte",
  "mittagskarte", "mittag", "abendkarte", "tageskarte"
]);

export type PreparedLinkedMenuImages = {
  imageDataUrls: string[];
  originalUrls: string[];
};

export async function prepareLinkedMenuImageFallback(value: string): Promise<PreparedLinkedMenuImages | null> {
  const rawImageUrls = await findLinkedMenuImageUrls(value, MAX_LINKED_MENU_IMAGE_CANDIDATES);
  const imageUrls = preferMenuImageFamily(rawImageUrls);

  if (imageUrls.length === 0) {
    logLinkedMenuImageFallback({ candidateCount: 0, selected: false });
    return null;
  }

  if (imageUrls.length !== rawImageUrls.length) {
    logLinkedMenuImageFallback({
      familyRestrictionApplied: true,
      rawCandidateCount: rawImageUrls.length,
      familyCandidateCount: imageUrls.length
    });
  }

  const imageDataUrls: string[] = [];
  const originalUrls: string[] = [];

  for (const imageUrl of imageUrls) {
    const prepared = await prepareLinkedMenuImage(imageUrl);

    if (prepared) {
      imageDataUrls.push(prepared);
      originalUrls.push(imageUrl);
    }
  }

  if (imageDataUrls.length === 0) {
    logLinkedMenuImageFallback({ candidateCount: imageUrls.length, preparedCount: 0, selected: false });
    return null;
  }

  logLinkedMenuImageFallback({
    candidateCount: imageUrls.length,
    preparedCount: imageDataUrls.length,
    selected: true
  });

  return { imageDataUrls, originalUrls };
}

// Bevorzugt eine erkennbare "Serie" zusammengehoeriger Speisekarten-Bilder
// (z.B. "speisekarte-1.png", "speisekarte-2.png", "speisekarte-dessert.png")
// gegenueber vereinzelten dekorativen Gerichtsfotos, deren Dateiname zufaellig
// ebenfalls positiv bewertet wurde (z.B. "speisekarte-fischgericht.jpg").
// Fallanalyse "sonnenalm.de", Juli 2026: trotz explizit passender Vorlieben
// ("Steak", "Schnitzel") fehlten diese Gerichte in den Empfehlungen - beide
// stehen auf der zweiten von vier echten Speisekarten-Seiten
// ("speisekarte-2.png"), die im Bild-Mix mit bis zu 6 dekorativen Fotos
// unterging. Nur wenn mindestens 2 Bilder denselben Serien-Schluessel teilen,
// wird auf genau diese Serie eingeschraenkt; sonst bleibt das Verhalten
// unveraendert (Fallback auf alle uebergebenen Bilder).
function preferMenuImageFamily(urls: string[]): string[] {
  const groups = new Map<string, string[]>();

  for (const url of urls) {
    const key = getMenuImageFamilyKey(url);

    if (!key) {
      continue;
    }

    const group = groups.get(key) ?? [];
    group.push(url);
    groups.set(key, group);
  }

  let bestKey: string | null = null;
  let bestGroup: string[] = [];

  for (const [key, group] of groups) {
    if (group.length >= 2 && group.length > bestGroup.length) {
      bestKey = key;
      bestGroup = group;
    }
  }

  if (!bestKey) {
    return urls;
  }

  return bestGroup;
}

// Liefert den gemeinsamen Serien-Schluessel fuer Bilder, deren Dateiname
// entweder auf eine Nummer (z.B. "speisekarte-1", "speisekarte-2") oder auf
// ein bekanntes Kartenabschnitt-Wort (z.B. "speisekarte-dessert") endet.
// Bilder ohne ein solches erkennbares Suffix-Muster (z.B.
// "speisekarte-fischgericht.jpg") liefern null und gruppieren sich damit
// nicht. Numerische und Kategorie-Treffer teilen sich bewusst denselben
// Basis-Schluessel (nur der Praefix "speisekarte" ohne numeric:/category:-
// Unterscheidung): reale Seiten wie sonnenalm.de mischen beide Muster
// innerhalb derselben Serie ("speisekarte-1", "speisekarte-2",
// "speisekarte-dessert", "speisekarte-kinder") und muessen als EINE Familie
// erkannt werden, nicht als zwei getrennte Zwei-Bild-Gruppen.
function getMenuImageFamilyKey(url: string): string | null {
  const stem = getUrlStem(url);
  const numericMatch = stem.match(/^(.*?)[-_]?(\d+)$/);

  if (numericMatch && numericMatch[1]) {
    const base = numericMatch[1].replace(/[-_]+$/, "");

    if (base.length > 0) {
      return base;
    }
  }

  const wordMatch = stem.match(/^(.*?)[-_]([a-zA-Z]+)$/);

  if (wordMatch && wordMatch[1] && wordMatch[2]) {
    const suffix = wordMatch[2].toLowerCase();
    const base = wordMatch[1].replace(/[-_]+$/, "");

    if (base.length > 0 && MENU_IMAGE_FAMILY_CATEGORY_WORDS.has(suffix)) {
      return base;
    }
  }

  return null;
}

// Dateiname ohne Pfad/Query/Extension, z.B.
// "https://sonnenalm.de/img/speisekarte-2.png?v=3" -> "speisekarte-2".
function getUrlStem(value: string): string {
  try {
    const parsed = new URL(value);
    const lastSegment = parsed.pathname.split("/").filter(Boolean).pop() ?? "";
    const decoded = decodeURIComponentSafe(lastSegment);
    return decoded.replace(/\.[a-zA-Z0-9]+$/, "").toLowerCase();
  } catch {
    return "";
  }
}

function decodeURIComponentSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

async function prepareLinkedMenuImage(imageUrl: string): Promise<string | null> {
  try {
    const response = await fetchWithTimeout(imageUrl, 8000);

    if (!response.ok) {
      return null;
    }

    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";

    if (!contentType.includes("image/")) {
      return null;
    }

    const originalBuffer = Buffer.from(await response.arrayBuffer());
    const metadata = await sharp(originalBuffer).metadata();
    const width = metadata.width ?? 0;

    if (width <= 0) {
      return null;
    }

    const resizedBuffer = await sharp(originalBuffer)
      .resize({
        width: Math.min(width, MAX_LINKED_MENU_IMAGE_WIDTH),
        withoutEnlargement: true
      })
      .png()
      .toBuffer();

    return `data:image/png;base64,${resizedBuffer.toString("base64")}`;
  } catch {
    return null;
  }
}

function logLinkedMenuImageFallback(fields: Record<string, string | number | boolean | undefined>) {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  const payload = Object.entries(fields)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${String(value).replace(/\s+/g, "_")}`)
    .join(" ");

  console.info(`[GUSTARO_LINKED_MENU_IMAGE_FALLBACK] ${payload}`);
}

async function fetchWithTimeout(value: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(value, {
      redirect: "follow",
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
}
