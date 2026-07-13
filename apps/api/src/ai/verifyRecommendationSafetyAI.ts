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
  signal
}: {
  restrictions: RecommendationSafetyRestriction[];
  candidates: RecommendationSafetyCandidate[];
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
  const request: ResponseCreateParamsNonStreaming = {
    model: getTwoStepModelForSource({ kind: "text" }),
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

  const response = await client.responses.create(request, signal ? { signal } : undefined);
  return JSON.parse(stripJsonFence(response.output_text ?? "{}")) as RecommendationSafetyVerifierResponse;
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
