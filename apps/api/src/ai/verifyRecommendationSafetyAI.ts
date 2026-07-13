import type { ResponseCreateParamsNonStreaming } from "openai/resources/responses/responses";
import {
  createTwoStepOpenAIClient,
  getTwoStepModelForSource,
  stripJsonFence
} from "./twoStepRecommendationAIUtils";
import type {
  RecommendationSafetyCandidate,
  RecommendationSafetyRestriction,
  RecommendationSafetyVerifierResponse
} from "../recommendation/recommendationSafetyVerifier";

export async function verifyRecommendationSafetyAI({
  restrictions,
  candidates,
  runId,
  signal
}: {
  restrictions: RecommendationSafetyRestriction[];
  candidates: RecommendationSafetyCandidate[];
  runId?: string;
  signal?: AbortSignal;
}): Promise<RecommendationSafetyVerifierResponse> {
  if (restrictions.length === 0 || candidates.length === 0) {
    return {
      candidates: candidates.map((candidate) => ({
        candidateId: candidate.id,
        checks: []
      }))
    };
  }

  const client = createTwoStepOpenAIClient();
  const model = getTwoStepModelForSource({ kind: "text" });
  const request: ResponseCreateParamsNonStreaming = {
    model,
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: buildSafetyVerifierPrompt({ restrictions, candidates })
          }
        ]
      }
    ]
  };

  const startedAt = Date.now();
  const response = await client.responses.create(request, signal ? { signal } : undefined);
  logDevAnalyzeTiming({
    runId,
    phase: "api.safety_verifier_openai_request",
    durationMs: Date.now() - startedAt,
    model,
    candidateCount: candidates.length,
    restrictionCount: restrictions.length,
    sdkRetries: "not_exposed",
    inputTokens: getUsageValue(response.usage, "input_tokens"),
    outputTokens: getUsageValue(response.usage, "output_tokens"),
    success: true
  });
  return JSON.parse(stripJsonFence(response.output_text ?? "{}")) as RecommendationSafetyVerifierResponse;
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

function buildSafetyVerifierPrompt({
  restrictions,
  candidates
}: {
  restrictions: RecommendationSafetyRestriction[];
  candidates: RecommendationSafetyCandidate[];
}) {
  return [
    "Du bist ein kleiner Safety-Verifier fuer GustaroAI.",
    "Pruefe nur sichtbaren Originaltext gegen aktive Allergene und Ausschluesse.",
    "Du bewertest keine Vorlieben, kein Ranking und keine Restaurantdaten.",
    "Nutze nur nameOriginal und descriptionOriginal der Kandidaten.",
    "Keine Websuche. Kein typisches Rezeptwissen. Keine Zutaten erfinden.",
    "Liefere fuer jeden Kandidaten und jede Restriction genau einen Check.",
    "",
    "Verdicts:",
    "- conflict: Die Restriction ist im sichtbaren Originaltext als vorhandene oder moegliche Zutat genannt. Evidence ist Pflicht.",
    "- no_visible_conflict: Kein sichtbarer Konflikt erkannt. Keine Evidence noetig.",
    "- free_from: Der sichtbare Text sagt ausdruecklich, dass die Restriction nicht enthalten ist. Evidence ist Pflicht.",
    "- uncertain: Keine sichere Entscheidung moeglich.",
    "",
    "Regeln:",
    "- Bei Allergenen ist may contain ein conflict.",
    "- without, free from, -free, ohne oder frei sind free_from, wenn sie sich sichtbar auf die Restriction beziehen.",
    "- Evidence muss ein kurzer exakter Ausschnitt aus nameOriginal oder descriptionOriginal sein.",
    "- source ist name oder description.",
    "- Verwende ausschliesslich die gelieferten IDs.",
    "",
    "Input:",
    JSON.stringify({ restrictions, candidates }, null, 2),
    "",
    "Antwort ausschliesslich als valides JSON ohne Markdown:",
    "{",
    '  "candidates": [',
    "    {",
    '      "candidateId": "candidate_0",',
    '      "checks": [',
    "        {",
    '          "restrictionId": "allergen_0",',
    '          "verdict": "conflict | no_visible_conflict | free_from | uncertain",',
    '          "evidence": "exakter sichtbarer Beleg falls conflict/free_from, sonst null",',
    '          "source": "name | description falls evidence gesetzt ist, sonst null"',
    "        }",
    "      ]",
    "    }",
    "  ]",
    "}"
  ].join("\n");
}
