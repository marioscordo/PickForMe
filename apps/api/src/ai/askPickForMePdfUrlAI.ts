import OpenAI from "openai";
import { z } from "zod";
import type { UserProfile } from "../types/profile";
import { blockReasonForRecommendation, buildProfilePromptLines } from "../profile/profileRules";

const RecommendationSchema = z.object({
  rank: z.number(),
  nameOriginal: z.string().min(1),
  translatedName: z.string().min(1),
  priceRaw: z.string().optional(),
  descriptionOriginal: z.string().optional(),
  reason: z.string().min(1),
  evidence: z.string().min(1)
});

const PdfAiResponseSchema = z.object({
  recommendations: z.array(RecommendationSchema).max(3)
});

type PdfAiRecommendation = z.infer<typeof RecommendationSchema>;

type ProfileInput = Partial<UserProfile>;

type AskPickForMePdfUrlAIInput = {
  pdfUrl: string;
  profile?: ProfileInput;
  situation?: string;
};

export async function askPickForMePdfUrlAI(input: AskPickForMePdfUrlAIInput) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY fehlt.");
  }

  const client = new OpenAI({ apiKey });

  const profile = input.profile ?? {};
  const model = process.env.OPENAI_PDF_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini";

  const response = await client.responses.create({
    model,
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: buildPdfPrompt({
              profile,
              situation: input.situation
            })
          },
          {
            type: "input_file",
            file_url: input.pdfUrl
          }
        ]
      }
    ]
  });

  const outputText = stripJsonFence(response.output_text ?? "");
  const parsedJson = JSON.parse(outputText);
  const parsed = PdfAiResponseSchema.parse(parsedJson);
  const profileSafe = validateAgainstProfile(parsed, profile);

  return toAnalyzeDataParts(profileSafe.recommendations);
}

function buildPdfPrompt(input: { profile: ProfileInput; situation?: string }) {
  return [
    "Du bist PickForMe, ein persoenlicher Restaurant-Assistent.",
    "Lies die beigefuegte Restaurant-Speisekarte aus dem PDF.",
    "Wichtig: Das PDF kann bildbasiert sein. Nutze sichtbare Inhalte der PDF-Seiten.",
    "Empfiehl bis zu 3 echte und sichere Gerichte aus der Speisekarte.",
    "Erfinde nichts.",
    "Aendere keine Gerichtsnamen.",
    "Nutze ausschliesslich Gerichte, die wirklich im PDF sichtbar sind.",
    "Keine allgemeinen Kategorien, keine Getraenke, keine Beilagen allein.",
    "WICHTIGE REGEL ZU BEILAGEN:",
    "Keine Beilagen ohne Treffer beim Hauptgericht.",
    "Empfiehl keine isolierten Beilagen, Extras oder Nebenartikel als Ausweichloesung, wenn wegen harter Ausschlusskriterien kein passendes Hauptgericht gefunden wird.",
    "Beilagen wie Pommes, Reis, Brot, Salatbeilage, Gemuese, Saucen, Dips oder einzelne Extras duerfen nur empfohlen werden, wenn sie ausdruecklich Teil eines passenden Hauptgerichts sind.",
    "Ausnahme: Snacks, kleine Mahlzeiten oder Beilagen duerfen nur dann empfohlen werden, wenn der Nutzer danach erkennbar sucht UND sie trotz Profilregeln sicher sind.",
    "Wenn keine sicheren Hauptgerichte oder vollwertigen Gerichte passen, gib eine leere recommendations-Liste zurueck.",
    "Bevorzuge vollwertige Hauptgerichte gegenueber Vorspeisen, Beilagen oder einfachen Salaten.",
    "Harte Profil-Ausschluesse sind verbindlich und duerfen nie durch Vorlieben ueberstimmt werden.",
    "Bei Allergien oder Unvertraeglichkeiten gilt: Wenn unsicher, nicht empfehlen.",
    "Ein Gericht darf nur empfohlen werden, wenn Gerichtname und Beleg sichtbar aus derselben Speisekarte stammen.",
    "evidence muss ein konkreter sichtbarer Originalauszug aus der Speisekarte sein.",
    "evidence darf niemals eine allgemeine Aussage sein wie: Preis und Beschreibung sind sichtbar.",
    "evidence soll den Gerichtnamen, die Beschreibung oder den sichtbaren Preis enthalten.",
    "Wenn kein konkreter Beleg moeglich ist, waehle ein anderes Gericht.",
    "",
    ...buildProfilePromptLines(input.profile, input.situation),
    "",
    "Antwortformat:",
    "Antworte ausschliesslich als valides JSON ohne Markdown.",
    "Schema:",
    "{",
    '  "recommendations": [',
    "    {",
    '      "rank": 1,',
    '      "nameOriginal": "exakter Gerichtname aus der Speisekarte",',
    '      "translatedName": "kurze deutsche Uebersetzung oder Kurzbeschreibung fuer deutschsprachige Nutzer",',
    '      "priceRaw": "Preis falls sichtbar",',
    '      "descriptionOriginal": "Originalbeschreibung falls sichtbar",',
    '      "reason": "kurze persoenliche Begruendung",',
    '      "evidence": "kurzer sichtbarer Originalbeleg aus der Speisekarte"',
    "    }",
    "  ]",
    "}"
  ].join("\n");
}

function validateAgainstProfile(
  result: { recommendations: PdfAiRecommendation[] },
  profile: ProfileInput
): { recommendations: PdfAiRecommendation[] } {
  const blocked = result.recommendations.filter((recommendation) =>
    blockReasonForRecommendation(recommendation, profile)
  );

  if (blocked.length > 0) {
    throw new Error(
      `Die PDF-KI-Antwort verletzt aktive Profilregeln: ${blocked.map((item) => item.nameOriginal).join(", ")}`
    );
  }

  return result;
}

function stripJsonFence(value: string) {
  return value
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function toAnalyzeDataParts(recommendations: PdfAiRecommendation[]) {
  const dishes = recommendations.map((item, index) => ({
    id: `pdf_ai_dish_${String(index + 1).padStart(3, "0")}`,
    nameOriginal: item.nameOriginal,
    descriptionOriginal: item.descriptionOriginal ?? item.evidence,
    price: parsePrice(item.priceRaw),
    category: "KI-PDF-Empfehlung",
    sourceLine: buildSourceLine(item)
  }));

  return {
    dishes,
    recommendations: recommendations.map((item, index) => ({
      dishId: dishes[index]!.id,
      rank: item.rank,
      reason: item.reason,
      translatedName: item.translatedName,

    }))
  };
}

function buildSourceLine(item: PdfAiRecommendation) {
  const evidence = item.evidence.trim();
  const genericEvidence =
    evidence.length < 8 ||
    evidence.toLowerCase().includes("sichtbar") ||
    evidence.toLowerCase().includes("derselben speisekarte") ||
    evidence.toLowerCase().includes("preis und beschreibung");

  if (!genericEvidence) {
    return evidence;
  }

  return item.descriptionOriginal ?? item.nameOriginal;
}

function parsePrice(value?: string) {
  if (!value) return undefined;

  const match = value.replace(",", ".").match(/(\d+(?:\.\d{1,2})?)/);
  if (!match) return undefined;

  return Number(match[1]);
}









