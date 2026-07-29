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

export type PreparedLinkedMenuImages = {
  imageDataUrls: string[];
  originalUrls: string[];
};

export async function prepareLinkedMenuImageFallback(value: string): Promise<PreparedLinkedMenuImages | null> {
  const imageUrls = await findLinkedMenuImageUrls(value, MAX_LINKED_MENU_IMAGE_CANDIDATES);

  if (imageUrls.length === 0) {
    logLinkedMenuImageFallback({ candidateCount: 0, selected: false });
    return null;
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
