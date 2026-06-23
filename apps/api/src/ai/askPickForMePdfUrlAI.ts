import OpenAI from "openai";
import { z } from "zod";

const RecommendationSchema = z.object({
  rank: z.number(),
  nameOriginal: z.string().min(1),
  priceRaw: z.string().optional(),
  descriptionOriginal: z.string().optional(),
  reason: z.string().min(1),
  evidence: z.string().min(1)
});

const PdfAiResponseSchema = z.object({
  recommendations: z.array(RecommendationSchema).length(3)
});

type PdfAiRecommendation = z.infer<typeof RecommendationSchema>;

type ProfileInput = {
  displayName?: string;
  primaryLikes?: string[];
  secondaryLikes?: string[];
  dislikes?: string[];
  intolerances?: string[];
  dietStyle?: string;
};

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

  return toAnalyzeDataParts(parsed.recommendations);
}

function buildPdfPrompt(input: { profile: ProfileInput; situation?: string }) {
  const profile = input.profile;

  return [
    "Du bist PickForMe, ein persoenlicher Restaurant-Assistent.",
    "Lies die beigefuegte Restaurant-Speisekarte aus dem PDF.",
    "Wichtig: Das PDF kann bildbasiert sein. Nutze sichtbare Inhalte der PDF-Seiten.",
    "Empfiehl genau 3 echte Gerichte aus der Speisekarte.",
    "Erfinde nichts.",
    "Aendere keine Gerichtsnamen.",
    "Nutze ausschliesslich Gerichte, die wirklich im PDF sichtbar sind.",
    "Keine allgemeinen Kategorien, keine Getraenke, keine Beilagen allein.",
    "Bevorzuge vollwertige Hauptgerichte gegenueber Vorspeisen, Beilagen oder einfachen Salaten.",
    "Wenn starke Vorlieben wie Fleisch, Fisch, kraeftige Sauce oder asiatische Kueche genannt sind, muessen diese im Ranking sichtbar bevorzugt werden.",
    "Salate nur empfehlen, wenn sie klar als eigenstaendiges Gericht passen oder keine staerkeren Hauptgerichte sichtbar sind.",
    "Ein Gericht darf nur empfohlen werden, wenn Gerichtname und Beleg sichtbar aus derselben Speisekarte stammen.",
    "evidence muss ein konkreter sichtbarer Originalauszug aus der Speisekarte sein.",
    "evidence darf niemals eine allgemeine Aussage sein wie: Preis und Beschreibung sind sichtbar.",
    "evidence soll den Gerichtnamen, die Beschreibung oder den sichtbaren Preis enthalten.",
    "Wenn kein konkreter Beleg moeglich ist, waehle ein anderes Gericht.",
    "",
    "Nutzerprofil:",
    `Name: ${profile.displayName ?? "Gast"}`,
    `Starke Vorlieben: ${(profile.primaryLikes ?? []).join(", ") || "keine Angabe"}`,
    `Weitere Vorlieben: ${(profile.secondaryLikes ?? []).join(", ") || "keine Angabe"}`,
    `Abneigungen: ${(profile.dislikes ?? []).join(", ") || "keine Angabe"}`,
    `Unvertraeglichkeiten/harte Ausschluesse: ${(profile.intolerances ?? []).join(", ") || "keine Angabe"}`,
    `Ernaehrungsstil: ${profile.dietStyle ?? "normal"}`,
    `Situation: ${input.situation ?? "nicht angegeben"}`,
    "",
    "Antwortformat:",
    "Antworte ausschliesslich als valides JSON ohne Markdown.",
    "Schema:",
    "{",
    '  "recommendations": [',
    "    {",
    '      "rank": 1,',
    '      "nameOriginal": "exakter Gerichtname aus der Speisekarte",',
    '      "priceRaw": "Preis falls sichtbar",',
    '      "descriptionOriginal": "Originalbeschreibung falls sichtbar",',
    '      "reason": "kurze persoenliche Begruendung",',
    '      "evidence": "kurzer sichtbarer Originalbeleg aus der Speisekarte"',
    "    }",
    "  ]",
    "}"
  ].join("\n");
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
      reason: item.reason
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
