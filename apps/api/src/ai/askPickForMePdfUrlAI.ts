import OpenAI from "openai";
import { z } from "zod";
import type { UserProfile } from "../types/profile";
import { blockReasonForRecommendation, buildProfilePromptLines } from "../profile/profileRules";

const RecommendationSchema = z.object({
  rank: z.number(),
  nameOriginal: z.string().min(1),
  translatedName: z.string().optional().default(""),
  priceRaw: z.string().optional(),
  descriptionOriginal: z.string().optional(),
  reason: z.string().min(1),
  evidence: z.string().min(1)
});

const PdfAiResponseSchema = z.object({
  recommendations: z.array(RecommendationSchema).max(3)
});

const LocalizedRecommendationTextSchema = z.object({
  recommendations: z.array(z.object({
    rank: z.number(),
    translatedName: z.string().optional().default(""),
    reason: z.string().optional().default("")
  })).max(3)
});

type PdfAiRecommendation = z.infer<typeof RecommendationSchema>;

type ProfileInput = Partial<UserProfile>;

type AskPickForMePdfUrlAIInput = {
  pdfUrl?: string;
  pdfUrls?: string[];
  profile?: ProfileInput;
  situation?: string;
  userLocale?: string;
};

export async function askPickForMePdfUrlAI(input: AskPickForMePdfUrlAIInput) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY fehlt.");
  }

  const client = new OpenAI({ apiKey });

  const profile = input.profile ?? {};
  const model = process.env.OPENAI_PDF_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini";
  const pdfUrls = uniquePdfUrls([
    ...(input.pdfUrls ?? []),
    input.pdfUrl ?? ""
  ]).slice(0, 8);

  if (pdfUrls.length === 0) {
    return toAnalyzeDataParts([]);
  }

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
              situation: input.situation,
              userLocale: input.userLocale
            })
          },
          ...pdfUrls.map((pdfUrl) => ({
            type: "input_file" as const,
            file_url: pdfUrl
          }))
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

function uniquePdfUrls(values: string[]) {
  const seen = new Set<string>();

  return values.filter((value) => {
    const normalized = value.trim();
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildPdfPrompt(input: { profile: ProfileInput; situation?: string; userLocale?: string }) {
  const targetLocale = normalizeTargetLocale(input.userLocale);
  const targetLanguage = getLanguageNameForLocale(targetLocale);

  return [
    "Du bist GustaroAI, ein persoenlicher Restaurant-Assistent.",
    "Lies die beigefuegte Restaurant-Speisekarte aus dem PDF.",
    `Sprache fuer nutzerseitige Ausgaben: ${targetLanguage} (${targetLocale}).`,
    "Originalgerichtstitel bleiben exakt in der Sprache der Speisekarte.",
    "translatedName muss eine direkte Uebersetzung des Originalgerichttitels in die Sprache fuer nutzerseitige Ausgaben sein.",
    "reason muss vollstaendig in der Sprache fuer nutzerseitige Ausgaben geschrieben sein.",
    "descriptionOriginal und evidence bleiben Originalbelege aus der Speisekarte.",
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
    '      "translatedName": "direkte Uebersetzung des Originalgerichttitels in der Sprache fuer nutzerseitige Ausgaben",',
    '      "priceRaw": "Preis falls sichtbar",',
    '      "descriptionOriginal": "Originalbeschreibung falls sichtbar",',
    '      "reason": "kurze persoenliche Begruendung in der Sprache fuer nutzerseitige Ausgaben",',
    '      "evidence": "kurzer sichtbarer Originalbeleg aus der Speisekarte"',
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

async function localizePdfRecommendationTexts({
  client,
  recommendations,
  userLocale
}: {
  client: OpenAI;
  recommendations: PdfAiRecommendation[];
  userLocale?: string;
}): Promise<PdfAiRecommendation[]> {
  if (recommendations.length === 0) {
    return recommendations;
  }

  const targetLocale = normalizeTargetLocale(userLocale);
  const targetLanguage = getLanguageNameForLocale(targetLocale);

  for (const strictRetry of [false, true]) {
    try {
      return await requestLocalizedPdfRecommendationTexts({
        client,
        recommendations,
        targetLocale,
        targetLanguage,
        strictRetry
      });
    } catch (error) {
      const retryDelayMs = getShortRateLimitRetryDelayMs(error);

      if (retryDelayMs === undefined) {
        continue;
      }

      await sleep(retryDelayMs);

      try {
        return await requestLocalizedPdfRecommendationTexts({
          client,
          recommendations,
          targetLocale,
          targetLanguage,
          strictRetry
        });
      } catch (retryError) {
        if (isRateLimitError(retryError)) {
          throw retryError;
        }
      }
    }
  }

  return buildDisplaySafeRecommendations(recommendations, targetLocale);
}

async function requestLocalizedPdfRecommendationTexts({
  client,
  recommendations,
  targetLocale,
  targetLanguage,
  strictRetry
}: {
  client: OpenAI;
  recommendations: PdfAiRecommendation[];
  targetLocale: string;
  targetLanguage: string;
  strictRetry: boolean;
}): Promise<PdfAiRecommendation[]> {
  try {
    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      temperature: 0,
      messages: [
        {
          role: "system",
          content: [
            "Translate recommendation display fields for the GustaroAI app.",
            `Target language: ${targetLanguage}.`,
            `Target locale: ${targetLocale}.`,
            "",
            "Context:",
            "- Every item is a restaurant dish.",
            "- nameOriginal is the exact original dish name from the menu.",
            "- translatedName is the user-facing dish display in the target language.",
            "- descriptionOriginal and evidence are menu context for avoiding mistranslation.",
            "",
            "Rules:",
            "- Translate only translatedName and reason.",
            "- translatedName must be derived from nameOriginal as a restaurant dish.",
            "- Use descriptionOriginal and evidence only to disambiguate the dish safely.",
            "- Culinary proper names may remain, but add a concise target-language explanation when the safe menu context supports it.",
            "- Translate preparation methods, regional or style markers, side dishes, and connector words into the target language even when a culinary proper name remains.",
            "- Do not return translatedName identical to nameOriginal unless no safe translation or explanation is possible.",
            "- Keep rank unchanged.",
            "- Do not translate or change nameOriginal.",
            "- Preserve factual elements exactly: animal/protein, cooking method, side dish, and preparation style.",
            "- Never replace one animal/protein with another.",
            "- If a culinary term is uncertain, keep the original term instead of guessing.",
            "- Do not keep English explanations such as finger-burning style; write them in the target language or keep the original culinary term.",
            "- Do not add facts.",
            "- Do not add dishes, prices, ingredients, atmosphere, ratings, or recommendations.",
            "- Do not invent anything.",
            "- Do not use English unless the target language is English.",
            strictRetry
              ? "- The previous output was rejected. Rewrite every translatedName and reason in the target language now without changing any facts."
              : "",
            "- Return only valid JSON."
          ].filter(Boolean).join("\n")
        },
        {
          role: "user",
          content: JSON.stringify({
            recommendations: recommendations.map((item) => ({
              rank: item.rank,
              nameOriginal: item.nameOriginal,
              descriptionOriginal: item.descriptionOriginal,
              reason: item.reason,
              evidence: item.evidence
            }))
          })
        }
      ]
    });
    const outputText = stripJsonFence(completion.choices[0]?.message?.content ?? "");
    const parsedJson = JSON.parse(outputText);
    const parsed = LocalizedRecommendationTextSchema.parse(parsedJson);

    const localizedRecommendations = recommendations.map((item, index) => {
      const localized = parsed.recommendations[index];

      return {
        ...item,
        translatedName: localized?.translatedName.trim() ?? "",
        reason: localized?.reason.trim() ?? ""
      };
    });

    assertLocalizedRecommendationTexts(localizedRecommendations, targetLocale);

    return localizedRecommendations;
  } catch (error) {
    if (isRateLimitError(error)) {
      throw error;
    }

    throw new Error("PDF_LOCALIZATION_FAILED");
  }
}

function assertLocalizedRecommendationTexts(
  recommendations: PdfAiRecommendation[],
  targetLocale: string
) {
  const targetLanguageCode = targetLocale.toLowerCase().split(/[-_]/)[0];

  if (targetLanguageCode === "en") {
    return;
  }

  const emptyDisplayText = recommendations.some((item) =>
    item.translatedName.trim().length === 0 ||
    item.reason.trim().length === 0
  );

  if (emptyDisplayText) {
    throw new Error("PDF_LOCALIZATION_FAILED");
  }

  const leakedEnglish = recommendations.some((item) =>
    hasLikelyEnglishDisplayText(item.translatedName) ||
    hasLikelyEnglishDisplayText(item.reason)
  );

  if (leakedEnglish) {
    throw new Error("PDF_LOCALIZATION_FAILED");
  }

  const unsafeProteinTranslation = recommendations.some((item) =>
    hasLikelyLambBeefTranslationConflict(item, item.translatedName) ||
    hasLikelyLambBeefTranslationConflict(item, item.reason)
  );

  if (unsafeProteinTranslation) {
    throw new Error("PDF_LOCALIZATION_FAILED");
  }
}

function buildDisplaySafeRecommendations(
  recommendations: PdfAiRecommendation[],
  targetLocale: string
) {
  return recommendations.map((item) => ({
    ...item,
    translatedName: getDisplaySafeTranslation(item, item.translatedName, targetLocale),
    reason: getDisplaySafeReason(item, item.reason, targetLocale)
  }));
}

function getDisplaySafeTranslation(item: PdfAiRecommendation, value: string, targetLocale: string) {
  const trimmed = value.trim();
  const targetLanguageCode = targetLocale.toLowerCase().split(/[-_]/)[0];

  if (targetLanguageCode === "en") {
    return trimmed || item.nameOriginal;
  }

  if (
    trimmed.length === 0 ||
    hasLikelyEnglishDisplayText(trimmed) ||
    hasLikelyLambBeefTranslationConflict(item, trimmed)
  ) {
    return item.nameOriginal;
  }

  return trimmed;
}

function getDisplaySafeReason(item: PdfAiRecommendation, value: string, targetLocale: string) {
  const trimmed = value.trim();
  const targetLanguageCode = targetLocale.toLowerCase().split(/[-_]/)[0];

  if (targetLanguageCode === "en") {
    return trimmed;
  }

  return hasLikelyEnglishDisplayText(trimmed) || hasLikelyLambBeefTranslationConflict(item, trimmed) ? "" : trimmed;
}

function hasLikelyEnglishDisplayText(value: string) {
  const normalized = ` ${value.toLowerCase().replace(/[^a-z]+/g, " ")} `;

  if (!normalized.trim()) {
    return false;
  }

  return [
    " a ",
    " an ",
    " and ",
    " appetite ",
    " baked ",
    " beef ",
    " burning ",
    " because ",
    " braised ",
    " chicken ",
    " choice ",
    " course ",
    " danish ",
    " dish ",
    " fillet ",
    " fish ",
    " for ",
    " fried ",
    " fresh ",
    " good ",
    " grilled ",
    " hearty ",
    " main ",
    " mixed ",
    " pork ",
    " prawns ",
    " recommendation ",
    " recommended ",
    " roasted ",
    " safe ",
    " salmon ",
    " served ",
    " shrimp ",
    " sirloin ",
    " strong ",
    " style ",
    " tenderloin ",
    " the ",
    " today ",
    " tuna ",
    " with "
  ].some((term) => normalized.includes(term));
}

function hasLikelyLambBeefTranslationConflict(item: PdfAiRecommendation, value: string) {
  const source = normalizeTranslationCheckText([
    item.nameOriginal,
    item.descriptionOriginal,
    item.evidence
  ].filter(Boolean).join(" "));
  const output = normalizeTranslationCheckText(value);
  const sourceIsLamb = includesAny(source, ["abbacchio", "agnello", "lamb", "lamm"]);

  return sourceIsLamb && includesAny(output, ["rind", "beef"]);
}

function normalizeTranslationCheckText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zäöüß]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function includesAny(value: string, terms: string[]) {
  return terms.some((term) => value.includes(term));
}

function getShortRateLimitRetryDelayMs(error: unknown) {
  if (!isRateLimitError(error)) {
    return undefined;
  }

  const retryDelayMs = getRetryAfterDelayMs(error) ?? 1000;

  return retryDelayMs <= 3000 ? retryDelayMs : undefined;
}

function isRateLimitError(error: unknown) {
  const status = typeof error === "object" && error !== null && "status" in error
    ? (error as { status?: unknown }).status
    : undefined;
  const message = error instanceof Error ? error.message : "";

  return status === 429 ||
    message.includes("429") ||
    message.includes("Rate limit") ||
    message.includes("rate limit") ||
    message.includes("TPM");
}

function getRetryAfterDelayMs(error: unknown) {
  const headers = typeof error === "object" && error !== null && "headers" in error
    ? (error as { headers?: unknown }).headers
    : undefined;

  if (!headers || typeof (headers as { get?: unknown }).get !== "function") {
    return undefined;
  }

  const getHeader = (name: string) => (headers as { get: (name: string) => string | null }).get(name);
  const retryAfterMs = Number(getHeader("retry-after-ms"));

  if (Number.isFinite(retryAfterMs) && retryAfterMs > 0) {
    return retryAfterMs;
  }

  const retryAfterSeconds = Number(getHeader("retry-after"));

  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return retryAfterSeconds * 1000;
  }

  return undefined;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
      translatedName: item.translatedName.trim() || item.nameOriginal,

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









