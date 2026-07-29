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
        overallVerdict: "safe",
        checkedRestrictionIds: [],
        matchedRestrictions: []
      }))
    };
  }

  const client = createTwoStepOpenAIClient();
  const model = getTwoStepModelForSource({ kind: "text" });
  const request: ResponseCreateParamsNonStreaming = {
    model,
    // Feste, niedrige Temperatur fuer konsistentere Kategorisierungs-
    // Entscheidungen bei Grenzfaellen (z.B. "Pilze" vs. "Pfifferlinge")
    // zwischen wiederholten Anfragen.
    temperature: 0,
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
    "Pruefe nur sichtbaren Originaltext gegen aktive Allergene, Ausschluesse und Unvertraeglichkeiten.",
    "Du bewertest keine Vorlieben, kein Ranking und keine Restaurantdaten.",
    "Nutze nur nameOriginal und descriptionOriginal der Kandidaten.",
    "Keine Websuche. Erfinde keine Zutaten, die im Text nicht vorkommen, und nimm nicht an, ein Gericht enthalte typische Rezeptzutaten, die nicht genannt sind.",
    "Ordne aber jede im Text tatsaechlich genannte Zutat mit deinem Lebensmittelwissen korrekt einer Restriction zu, auch wenn der Restriktionsbegriff selbst nicht woertlich im Text vorkommt (Synonyme, Sorten, Unterarten, Singular/Plural, regionale Schreibweisen). Das ist Kategorisierung einer genannten Zutat, keine Erfindung.",
    "Beispiel: Der Ausschluss 'Pilze' gilt auch fuer im Text genannte Pilzarten wie Pfifferlinge, Steinpilze, Trueffel, Morcheln oder Shiitake, selbst wenn das Wort 'Pilz' selbst nicht vorkommt.",
    "Liefere fuer jeden Kandidaten genau ein Paket-Ergebnis.",
    "Pruefe jeden Kandidaten gegen das komplette Restriktionspaket.",
    "Jede Restriction-ID muss pro Kandidat in checkedRestrictionIds enthalten sein.",
    "Lasse keine Restriction weg, nur weil sie unwichtig, unwahrscheinlich, irrelevant oder ohne eindeutige Evidenz wirkt.",
    "Pruefe nicht nur die erste, wichtigste oder wahrscheinlichste Restriction.",
    "matchedRestrictions enthaelt nur Restrictions mit conflict oder uncertain.",
    "Wenn fuer keine Restriction ein Konflikt oder eine Unsicherheit besteht, ist overallVerdict safe und matchedRestrictions ist leer.",
    "",
    "Verdicts:",
    "- safe: Fuer keine der geprueften Restrictions wurde ein sichtbarer Konflikt oder eine Unsicherheit erkannt.",
    "- conflict: Mindestens eine Restriction ist im sichtbaren Originaltext als vorhandene oder moegliche Zutat genannt. Evidence ist Pflicht.",
    "- uncertain: Mindestens eine Restriction kann nicht sicher entschieden werden.",
    "",
    "Regeln:",
    "- Bei Allergenen ist may contain ein conflict.",
    "- without, free from, -free, ohne oder frei sind safe, wenn sie sich sichtbar auf die Restriction beziehen.",
    "- Evidence muss bei conflict ein kurzer exakter Ausschnitt aus nameOriginal oder descriptionOriginal sein.",
    "- source ist bei conflict name oder description.",
    "- Bei uncertain ist evidence optional; wenn gesetzt, muss sie sichtbar aus nameOriginal oder descriptionOriginal stammen.",
    "- Bist du dir bei der Kategorisierung einer genannten Zutat nicht sicher, ob sie zu einer Restriction gehoert, waehle uncertain statt safe.",
    "- Verwende ausschliesslich die gelieferten IDs.",
    "- Aendere Candidate-IDs und Restriction-IDs nicht.",
    "- Fuehre vor der finalen Antwort intern eine Vollstaendigkeitspruefung durch: Kandidaten zaehlen, Restrictions zaehlen und sicherstellen, dass jeder Kandidat alle Restriction-IDs in checkedRestrictionIds enthaelt.",
    "- Gib diese Selbstpruefung nicht aus. Gib nur die finale JSON-Antwort aus.",
    "",
    "Input:",
    JSON.stringify({ restrictions, candidates }, null, 2),
    "",
    "Antwort ausschliesslich als valides JSON ohne Markdown:",
    "{",
    '  "candidates": [',
    "    {",
    '      "candidateId": "candidate_0",',
    '      "overallVerdict": "safe | conflict | uncertain",',
    '      "checkedRestrictionIds": ["restriction_0", "restriction_1", "restriction_2"],',
    '      "matchedRestrictions": []',
    "    },",
    "    {",
    '      "candidateId": "candidate_1",',
    '      "overallVerdict": "conflict",',
    '      "checkedRestrictionIds": ["restriction_0", "restriction_1", "restriction_2"],',
    '      "matchedRestrictions": [',
    "        {",
    '          "restrictionId": "restriction_2",',
    '          "verdict": "conflict | uncertain",',
    '          "evidence": "exakter sichtbarer Beleg falls conflict, sonst null",',
    '          "source": "name | description falls evidence gesetzt ist, sonst null"',
    "        }",
    "      ]",
    "    }",
    "  ]",
    "}"
  ].join("\n");
}
