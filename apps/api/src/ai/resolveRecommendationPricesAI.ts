import { z } from "zod";
import type { ResponseCreateParamsNonStreaming } from "openai/resources/responses/responses";
import {
  createTwoStepOpenAIClient,
  getTwoStepModelForSource,
  stripJsonFence
} from "./twoStepRecommendationAIUtils";

const PRICE_RESOLVER_SOURCE_CHAR_LIMIT = 40000;

export type PriceResolutionItem = {
  id: string;
  nameOriginal: string;
  descriptionOriginal?: string | null;
  sourceEvidence?: string | null;
  currentPriceRaw?: string | null;
};

export type PriceResolutionResult = {
  id: string;
  priceRaw: string | null;
  evidence: string | null;
};

const PriceResolutionResponseSchema = z.object({
  prices: z.array(z.object({
    id: z.string().trim().min(1),
    priceRaw: z.string().trim().min(1).nullable(),
    evidence: z.string().trim().min(1).nullable()
  }))
});

export async function resolveRecommendationPricesAI({
  items,
  sourceText,
  runId,
  signal
}: {
  items: PriceResolutionItem[];
  sourceText: string;
  runId?: string;
  signal?: AbortSignal;
}): Promise<PriceResolutionResult[]> {
  const unresolvedItems = items.filter((item) => !item.currentPriceRaw?.trim());
  const trimmedSourceText = sourceText.trim();

  if (unresolvedItems.length === 0 || !trimmedSourceText) {
    return [];
  }

  const client = createTwoStepOpenAIClient();
  const model = getTwoStepModelForSource({ kind: "text" });
  const prompt = buildPriceResolverPrompt({
    items: unresolvedItems,
    sourceText: trimmedSourceText.slice(0, PRICE_RESOLVER_SOURCE_CHAR_LIMIT)
  });
  const request: ResponseCreateParamsNonStreaming = {
    model,
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: prompt
          }
        ]
      }
    ]
  };

  const startedAt = Date.now();
  const response = await client.responses.create(request, signal ? { signal } : undefined);
  logDevAnalyzeTiming({
    runId,
    phase: "api.price_resolver_openai_request",
    durationMs: Date.now() - startedAt,
    model,
    candidateCount: unresolvedItems.length,
    inputTokens: getUsageValue(response.usage, "input_tokens"),
    outputTokens: getUsageValue(response.usage, "output_tokens"),
    success: true
  });

  return validatePriceResolutionResults({
    items: unresolvedItems,
    sourceText: trimmedSourceText,
    parsed: PriceResolutionResponseSchema.parse(JSON.parse(stripJsonFence(response.output_text ?? "{}")))
  });
}

function validatePriceResolutionResults({
  items,
  sourceText,
  parsed
}: {
  items: PriceResolutionItem[];
  sourceText: string;
  parsed: z.infer<typeof PriceResolutionResponseSchema>;
}) {
  const knownIds = new Set(items.map((item) => item.id));
  const sourceNeedle = normalizeForEvidenceCheck(sourceText);
  const results: PriceResolutionResult[] = [];

  for (const result of parsed.prices) {
    if (!knownIds.has(result.id)) {
      continue;
    }

    const priceRaw = result.priceRaw?.trim() || null;
    const evidence = result.evidence?.trim() || null;

    if (!priceRaw || !evidence || !/\d/.test(priceRaw)) {
      results.push({ id: result.id, priceRaw: null, evidence: null });
      continue;
    }

    const normalizedEvidence = normalizeForEvidenceCheck(evidence);
    const normalizedPrice = normalizeForEvidenceCheck(priceRaw);
    const evidenceIsFromSource = normalizedEvidence.length > 0 && sourceNeedle.includes(normalizedEvidence);
    const evidenceContainsPrice = normalizedPrice.length > 0 && normalizedEvidence.includes(normalizedPrice);

    results.push({
      id: result.id,
      priceRaw: evidenceIsFromSource && evidenceContainsPrice ? priceRaw : null,
      evidence: evidenceIsFromSource && evidenceContainsPrice ? evidence : null
    });
  }

  return results;
}

function buildPriceResolverPrompt({
  items,
  sourceText
}: {
  items: PriceResolutionItem[];
  sourceText: string;
}) {
  return [
    "Du bist ein strenger Preis-Resolver fuer GustaroAI.",
    "Aufgabe: Ergaenze fehlende Preise fuer die gelieferten Empfehlungen.",
    "",
    "Verbindliche Regeln:",
    "- Nutze ausschliesslich den sichtbaren Quellenkontext.",
    "- Gib nur Preise zurueck, die eindeutig dem konkreten Gericht zugeordnet sind.",
    "- Erfinde keine Preise, keine Waehrungen und keine Preisbereiche.",
    "- Wenn mehrere Preise eindeutig zu demselben Gericht gehoeren, waehle den normalen Einzelgerichtspreis.",
    "- Wenn die Zuordnung unsicher ist oder kein Preis sichtbar ist, gib priceRaw null zurueck.",
    "- evidence muss der kurze Originalausschnitt aus dem Quellenkontext sein, der Name und Preis belegt.",
    "- Veraendere bestehende Empfehlungen nicht.",
    "",
    "Antwort ausschliesslich als JSON:",
    "{\"prices\":[{\"id\":\"main_0\",\"priceRaw\":\"36,00 EUR\",\"evidence\":\"Originalausschnitt mit Name und Preis\"}]}",
    "",
    "Empfehlungen ohne Preis:",
    JSON.stringify(items.map((item) => ({
      id: item.id,
      nameOriginal: item.nameOriginal,
      descriptionOriginal: item.descriptionOriginal ?? null,
      sourceEvidence: item.sourceEvidence ?? null
    })), null, 2),
    "",
    "Quellenkontext:",
    sourceText
  ].join("\n");
}

function normalizeForEvidenceCheck(value: string) {
  return value
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

type DevTimingValue = string | number | boolean | null | undefined;

function logDevAnalyzeTiming(fields: Record<string, DevTimingValue>) {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  const payload = Object.entries(fields)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${key}=${String(value).replace(/\s+/g, "_")}`)
    .join(" ");

  console.info(`[GUSTARO_DEV_ANALYZE_TIMING] ${payload}`);
}

function getUsageValue(usage: unknown, key: "input_tokens" | "output_tokens") {
  if (!usage || typeof usage !== "object" || !(key in usage)) {
    return undefined;
  }

  const value = (usage as Record<string, unknown>)[key];
  return typeof value === "number" ? value : undefined;
}
