import type { ResponseCreateParamsNonStreaming } from "openai/resources/responses/responses";
import {
  createTwoStepOpenAIClient,
  getTwoStepModelForSource,
  stripJsonFence
} from "./twoStepRecommendationAIUtils";
import { isAnalyzeDiagnosticsEnabled } from "./twoStepRecommendationDiagnostics";
import { logAnalyzeOpsDiagnostic } from "./twoStepRecommendationDiagnostics";

export type AttributionEvidenceProfileType = "preference" | "exclusion" | "allergen";
export type AttributionEvidenceVerdict = "valid" | "invalid" | "uncertain";

export type AttributionEvidenceCheck = {
  attributionId: string;
  profileType: AttributionEvidenceProfileType;
  profileValue: string;
  nameOriginal: string;
  descriptionOriginal?: string | null;
};

export type AttributionEvidenceResult = {
  attributionId: string;
  verdict: AttributionEvidenceVerdict;
  profileEvidence: string | null;
  evidenceSource: "name" | "description" | null;
};

type AttributionEvidenceResponse = {
  checks?: Array<{
    attributionId?: string;
    verdict?: string;
    profileEvidence?: string | null;
    evidenceSource?: string | null;
  }>;
};

const ATTRIBUTION_EVIDENCE_TIMEOUT_MS = 8000;

export async function verifyAttributionEvidenceAI({
  checks,
  runId,
  signal
}: {
  checks: AttributionEvidenceCheck[];
  runId?: string;
  signal?: AbortSignal;
}): Promise<AttributionEvidenceResult[]> {
  if (checks.length === 0) {
    return [];
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
            text: buildAttributionEvidencePrompt(checks)
          }
        ]
      }
    ]
  };

  const startedAt = Date.now();

  try {
    const response = await withAttributionEvidenceTimeout(
      (timeoutSignal) => client.responses.create(request, { signal: timeoutSignal ?? signal }),
      ATTRIBUTION_EVIDENCE_TIMEOUT_MS
    );
    logDevAnalyzeTiming({
      runId,
      phase: "api.attribution_evidence_openai_request",
      durationMs: Date.now() - startedAt,
      model,
      attributionCount: checks.length,
      sdkRetries: "not_exposed",
      inputTokens: getUsageValue(response.usage, "input_tokens"),
      outputTokens: getUsageValue(response.usage, "output_tokens"),
      success: true
    });
    logAnalyzeOpsDiagnostic({
      runId,
      phase: "attribution_evidence",
      durationMs: Date.now() - startedAt,
      candidateCount: checks.length
    });

    return validateAttributionEvidenceResponse(checks, JSON.parse(stripJsonFence(response.output_text ?? "{}")));
  } catch (error) {
    logDevAnalyzeTiming({
      runId,
      phase: "api.attribution_evidence_openai_request",
      durationMs: Date.now() - startedAt,
      model,
      attributionCount: checks.length,
      success: false,
      errorClass: error instanceof Error ? error.name : typeof error
    });
    logAnalyzeOpsDiagnostic({
      runId,
      phase: "attribution_evidence",
      durationMs: Date.now() - startedAt,
      candidateCount: checks.length,
      errorClass: error instanceof Error && error.message === "ATTRIBUTION_EVIDENCE_TIMEOUT"
        ? "timeout"
        : error instanceof SyntaxError
          ? "invalid-response"
          : "connection"
    });

    if (error instanceof Error && error.message === "ATTRIBUTION_EVIDENCE_TIMEOUT") {
      throw error;
    }

    if (error instanceof SyntaxError) {
      return checks.map((check) => ({
        attributionId: check.attributionId,
        verdict: "uncertain",
        profileEvidence: null,
        evidenceSource: null
      }));
    }

    throw new Error("ATTRIBUTION_EVIDENCE_TECHNICAL_ERROR");
  }
}

export function validateAttributionEvidenceResponse(
  checks: AttributionEvidenceCheck[],
  response: AttributionEvidenceResponse
): AttributionEvidenceResult[] {
  const expectedIds = new Set(checks.map((check) => check.attributionId));
  const responseChecks = Array.isArray(response.checks) ? response.checks : [];
  const resultsById = new Map<string, AttributionEvidenceResult>();
  const duplicateIds = new Set<string>();
  const checksById = new Map(checks.map((check) => [check.attributionId, check]));

  for (const result of responseChecks) {
    const attributionId = result.attributionId?.trim();

    if (!attributionId || !expectedIds.has(attributionId)) {
      continue;
    }

    if (resultsById.has(attributionId)) {
      duplicateIds.add(attributionId);
      continue;
    }

    const expectedCheck = checksById.get(attributionId);
    const verdict = normalizeVerdict(result.verdict);
    resultsById.set(attributionId, normalizeEvidenceResult({
      attributionId,
      verdict,
      profileEvidence: result.profileEvidence,
      evidenceSource: result.evidenceSource,
      expectedCheck
    }));
  }

  return checks.map((check) => {
    if (duplicateIds.has(check.attributionId)) {
      return uncertainAttributionResult(check.attributionId);
    }

    return resultsById.get(check.attributionId) ?? uncertainAttributionResult(check.attributionId);
  });
}

function normalizeEvidenceResult({
  attributionId,
  verdict,
  profileEvidence,
  evidenceSource,
  expectedCheck
}: {
  attributionId: string;
  verdict: AttributionEvidenceVerdict;
  profileEvidence: string | null | undefined;
  evidenceSource: string | null | undefined;
  expectedCheck: AttributionEvidenceCheck | undefined;
}): AttributionEvidenceResult {
  if (verdict !== "valid") {
    return {
      attributionId,
      verdict,
      profileEvidence: null,
      evidenceSource: null
    };
  }

  const evidence = typeof profileEvidence === "string" ? profileEvidence.trim() : "";
  const source = evidenceSource === "name" || evidenceSource === "description" ? evidenceSource : null;
  const sourceText = source === "name"
    ? expectedCheck?.nameOriginal
    : source === "description"
      ? expectedCheck?.descriptionOriginal
      : null;

  if (!evidence || !source || !sourceText || !containsVisibleEvidence(sourceText, evidence)) {
    return uncertainAttributionResult(attributionId);
  }

  return {
    attributionId,
    verdict: "valid",
    profileEvidence: evidence,
    evidenceSource: source
  };
}

function uncertainAttributionResult(attributionId: string): AttributionEvidenceResult {
  return {
    attributionId,
    verdict: "uncertain",
    profileEvidence: null,
    evidenceSource: null
  };
}

function normalizeVerdict(value: string | undefined): AttributionEvidenceVerdict {
  if (value === "valid" || value === "invalid" || value === "uncertain") {
    return value;
  }

  return "uncertain";
}

function containsVisibleEvidence(sourceText: string, evidence: string) {
  return normalizeEvidenceText(sourceText).includes(normalizeEvidenceText(evidence));
}

function normalizeEvidenceText(value: string) {
  return value
    .toLowerCase()
    .replace(/ß/g, "ss")
    .replace(/ü/g, "ue")
    .replace(/ö/g, "oe")
    .replace(/ä/g, "ae")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function withAttributionEvidenceTimeout<T>(
  factory: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number
): Promise<T> {
  const controller = new AbortController();
  let didTimeout = false;
  const promise = factory(controller.signal);

  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      didTimeout = true;
      controller.abort();
      reject(new Error("ATTRIBUTION_EVIDENCE_TIMEOUT"));
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);

        if (didTimeout) {
          return;
        }

        reject(error);
      });
  });
}

function buildAttributionEvidencePrompt(checks: AttributionEvidenceCheck[]) {
  return [
    "Du bist ein kleiner Attribution-Evidence-Verifier fuer GustaroAI.",
    "Pruefe ausschliesslich, ob profileValue direkt durch sichtbaren Text im gelieferten Gerichtsnamen oder in der gelieferten Gerichtsbeschreibung belegt ist.",
    "Du bekommst keinen kompletten Menuekontext, keinen reason und keine weiteren Profildaten.",
    "",
    "Verdicts:",
    "- valid: direkte Uebersetzung, Synonym oder eindeutig direkte Beziehung zwischen Lebensmitteln, Lebensmittelkategorien oder konkreten Gerichten.",
    "- invalid: klar keine direkte Beziehung.",
    "- uncertain: Beziehung nicht eindeutig.",
    "",
    "Regeln:",
    "- valid nur, wenn ein sichtbarer woertlicher Ausschnitt aus nameOriginal oder descriptionOriginal eine direkte Uebersetzung, ein Synonym oder eine eindeutig direkte Lebensmittelbeziehung zu profileValue ist.",
    "- Gib bei valid den exakten sichtbaren Ausschnitt als profileEvidence zurueck und evidenceSource als name oder description.",
    "- Wenn kein exakter sichtbarer Ausschnitt existiert, ist verdict uncertain oder invalid und profileEvidence/evidenceSource sind null.",
    "- Keine Rezeptannahmen oder Zutatenableitungen.",
    "- Keine Eigenschaften, Geschmacks-, Zubereitungs- oder Beliebtheitsannahmen.",
    "- Keine Vermutung aus Gerichtstypen.",
    "- Nutze ausschliesslich die gelieferten attributionId-Werte.",
    "",
    "Input:",
    JSON.stringify({ checks }, null, 2),
    "",
    "Antwort ausschliesslich als valides JSON ohne Markdown:",
    "{",
    '  "checks": [',
    "    {",
    '      "attributionId": "attr_0",',
    '      "verdict": "valid | invalid | uncertain",',
    '      "profileEvidence": "exakter sichtbarer Ausschnitt oder null",',
    '      "evidenceSource": "name | description | null"',
    "    }",
    "  ]",
    "}"
  ].join("\n");
}

type DevTimingValue = string | number | boolean | null | undefined;

function logDevAnalyzeTiming(fields: Record<string, DevTimingValue>) {
  if (!isAnalyzeDiagnosticsEnabled()) {
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
