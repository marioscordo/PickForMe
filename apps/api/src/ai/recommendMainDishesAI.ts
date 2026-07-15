import type { ResponseCreateParamsNonStreaming } from "openai/resources/responses/responses";
import type { Situation, UserProfile } from "../types/profile";
import type { PreferredDishRole, RequestedDishRole } from "../types/api";
import {
  buildTwoStepSourceContent,
  createTwoStepOpenAIClient,
  getLanguageNameForLocale,
  getTwoStepSourceContentDiagnostics,
  getTwoStepModelForSource,
  normalizeTargetLocale,
  stripJsonFence
} from "./twoStepRecommendationAIUtils";
import {
  MainDishAIResponseSchema,
  type MainDishAIAnalyzedDish,
  type MainDishAIRecommendation,
  type MainDishAIRemovedDish,
  type MainDishAIResultSummary,
  type MainDishAISafeCandidate,
  type TwoStepMenuSourceInput
} from "./twoStepRecommendationSchemas";
import { verifyRecommendationSafetyAI } from "./verifyRecommendationSafetyAI";
import {
  buildRecommendationSafetyRestrictions,
  candidateContainsEvidence,
  filterSafeRecommendationCandidates
} from "../recommendation/recommendationSafetyVerifier";

type MainDishAiDiagnosticRow = {
  index: number;
  nameOriginal: string;
  translatedNamePresent?: boolean;
  translatedName?: string;
  descriptionOriginalPresent?: boolean;
  translatedDescriptionPresent?: boolean;
  detectedConflicts?: string[];
  isSafe?: boolean;
  matchedProfileValue?: string;
  profileSafetyHasKnownConflict?: boolean;
  profileSafetyUncertainForAllergy?: boolean;
  profileSafetyConflictReason?: string | null;
  reason?: string;
  inAllDishes: boolean;
  inRemovedDishes: boolean;
  inSafeCandidates: boolean;
  inRecommendations: boolean;
};

export async function recommendMainDishesAI({
  source,
  profile,
  situation,
  requestedDishRoles,
  preferredDishRole,
  userLocale,
  runId,
  signal
}: {
  source: TwoStepMenuSourceInput;
  profile: UserProfile;
  situation?: Situation;
  requestedDishRoles?: RequestedDishRole[];
  preferredDishRole?: PreferredDishRole;
  userLocale?: string;
  runId?: string;
  signal?: AbortSignal;
}): Promise<MainDishAIRecommendation[]> {
  const client = createTwoStepOpenAIClient();
  const targetLocale = normalizeTargetLocale(userLocale ?? profile.outputLocale);
  const targetLanguage = getLanguageNameForLocale(targetLocale);
  const model = getTwoStepModelForSource(source);
  const sourceContent = buildTwoStepSourceContent({
    prompt: buildMainDishPrompt({
      profile,
      situation,
      requestedDishRoles,
      preferredDishRole,
      targetLocale,
      targetLanguage
    }),
    source
  });
  const contentDiagnostics = getTwoStepSourceContentDiagnostics(source, sourceContent);
  const request: ResponseCreateParamsNonStreaming = {
    model,
    input: [
      {
        role: "user",
        content: sourceContent
      }
    ]
  };

  let parsed: ReturnType<typeof MainDishAIResponseSchema.parse> | undefined;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const requestStartedAt = Date.now();
    const response = await client.responses.create(request, signal ? { signal } : undefined)
      .catch((error) => {
        logDevAnalyzeTiming({
          runId,
          phase: "api.main_ai_request",
          durationMs: Date.now() - requestStartedAt,
          model,
          retryAttempt: attempt,
          sdkRetries: "not_exposed",
          ...contentDiagnostics,
          success: false,
          errorClass: error instanceof Error ? error.name : typeof error
        });
        throw error;
      });
    logDevAnalyzeTiming({
      runId,
      phase: "api.main_ai_request",
      durationMs: Date.now() - requestStartedAt,
      model,
      retryAttempt: attempt,
      sdkRetries: "not_exposed",
      ...contentDiagnostics,
      inputTokens: getUsageValue(response.usage, "input_tokens"),
      outputTokens: getUsageValue(response.usage, "output_tokens"),
      success: true
    });

    const parseStartedAt = Date.now();

    try {
      parsed = MainDishAIResponseSchema.parse(JSON.parse(stripJsonFence(response.output_text ?? "{}")));
      normalizeMissingTranslatedDescriptions(parsed, targetLocale);
      validateDescriptionTranslationContract(parsed);
      logDevAnalyzeTiming({
        runId,
        phase: "api.main_ai_parse",
        durationMs: Date.now() - parseStartedAt,
        retryAttempt: attempt,
        candidateCount: parsed.safeCandidates.length,
        success: true
      });
      break;
    } catch (error) {
      logDevAnalyzeTiming({
        runId,
        phase: "api.main_ai_parse",
        durationMs: Date.now() - parseStartedAt,
        retryAttempt: attempt,
        success: false,
        errorClass: error instanceof Error ? error.name : typeof error
      });

      if (attempt === 1 && isInvalidAiResponseError(error)) {
        continue;
      }

      throw toSyntaxError(error);
    }
  }

  if (!parsed) {
    throw new SyntaxError("AI_RESPONSE_INVALID");
  }

  const verifierSafe = await applyMainDishVerifierSafety(parsed, profile, runId, signal);
  logMainDishAiResponseDiagnostic(verifierSafe, runId);

  return verifierSafe.recommendations;
}

function normalizeMissingTranslatedDescriptions(
  response: ReturnType<typeof MainDishAIResponseSchema.parse>,
  targetLocale: string
) {
  const items = getDescriptionContractItems(response);

  for (const item of items) {
    const descriptionOriginal = item.descriptionOriginal?.trim();
    const translatedDescription = item.translatedDescription?.trim();

    if (
      descriptionOriginal &&
      !translatedDescription &&
      !isDescriptionLikelyInTargetLanguage(descriptionOriginal, targetLocale)
    ) {
      item.translatedDescription = null;
    }
  }
}

function validateDescriptionTranslationContract(
  response: ReturnType<typeof MainDishAIResponseSchema.parse>,
) {
  const items = getDescriptionContractItems(response);

  for (const item of items) {
    const descriptionOriginal = item.descriptionOriginal?.trim();
    const translatedDescription = item.translatedDescription?.trim();

    if (!descriptionOriginal && translatedDescription) {
      throw new SyntaxError("AI_RESPONSE_INVALID_DESCRIPTION_WITHOUT_SOURCE");
    }
  }
}

function getDescriptionContractItems(response: ReturnType<typeof MainDishAIResponseSchema.parse>) {
  const items = [
    ...response.safeCandidates,
    ...response.recommendations,
    ...response.safeCandidates
      .map((candidate) => candidate.recommendationPayload)
      .filter((payload): payload is NonNullable<typeof payload> => Boolean(payload))
  ];

  return items;
}

function isDescriptionLikelyInTargetLanguage(value: string, targetLocale: string) {
  const targetLanguage = targetLocale.split("-")[0]?.toLowerCase();

  if (targetLanguage === "de") {
    return looksLikeGermanText(value);
  }

  if (targetLanguage === "en") {
    return looksLikeEnglishText(value);
  }

  return false;
}

function looksLikeGermanText(value: string) {
  const normalized = value.toLowerCase();
  return /[äöüß]/.test(normalized) ||
    /\b(?:und|mit|auf|aus|vom|von|der|die|das|eine|einer|frisch|hausgemacht)\b/.test(normalized);
}

function looksLikeEnglishText(value: string) {
  const normalized = value.toLowerCase();
  return /\b(?:and|with|from|served|fresh|homemade|grilled|roasted|sauce|salad|cheese)\b/.test(normalized);
}

function isInvalidAiResponseError(error: unknown) {
  return error instanceof SyntaxError ||
    (error instanceof Error && error.name === "ZodError");
}

function toSyntaxError(error: unknown) {
  if (error instanceof SyntaxError) {
    return error;
  }

  if (error instanceof Error && error.name === "ZodError") {
    return new SyntaxError("AI_RESPONSE_INVALID_SCHEMA");
  }

  return error;
}

function logMainDishAiResponseDiagnostic(
  response: {
    allDishes: MainDishAIAnalyzedDish[];
    removedDishes: MainDishAIRemovedDish[];
    safeCandidates: MainDishAISafeCandidate[];
    recommendations: MainDishAIRecommendation[];
    resultSummary: MainDishAIResultSummary;
  },
  runId?: string
) {
  const rows = new Map<string, MainDishAiDiagnosticRow>();

  const getRow = (nameOriginal: string) => {
    const key = normalizeDiagnosticName(nameOriginal);
    const existing = rows.get(key);
    if (existing) return existing;

    const row: MainDishAiDiagnosticRow = {
      index: rows.size + 1,
      nameOriginal: truncateDiagnosticValue(nameOriginal),
      inAllDishes: false,
      inRemovedDishes: false,
      inSafeCandidates: false,
      inRecommendations: false
    };
    rows.set(key, row);
    return row;
  };

  response.allDishes.forEach((dish) => {
    const row = getRow(dish.nameOriginal);
    row.inAllDishes = true;
    row.descriptionOriginalPresent = hasDiagnosticValue(dish.descriptionOriginal);
    row.detectedConflicts = dish.detectedConflicts.map(truncateDiagnosticValue);
    row.isSafe = dish.isSafe;
  });

  response.removedDishes.forEach((dish) => {
    const row = getRow(dish.nameOriginal);
    row.inRemovedDishes = true;
    row.matchedProfileValue = truncateDiagnosticValue(dish.matchedProfileValue);
    row.reason = truncateDiagnosticValue(dish.reason);
  });

  response.safeCandidates.forEach((candidate) => {
    const row = getRow(candidate.nameOriginal);
    row.inSafeCandidates = true;
    row.descriptionOriginalPresent = row.descriptionOriginalPresent ?? hasDiagnosticValue(candidate.descriptionOriginal);
    row.reason = row.reason ?? truncateDiagnosticValue(candidate.scoreReason);
  });

  response.recommendations.forEach((recommendation) => {
    const row = getRow(recommendation.nameOriginal);
    row.inRecommendations = true;
    row.translatedNamePresent = hasDiagnosticValue(recommendation.translatedName);
    row.translatedName = truncateDiagnosticValue(recommendation.translatedName);
    row.descriptionOriginalPresent = row.descriptionOriginalPresent ?? hasDiagnosticValue(recommendation.descriptionOriginal);
    row.translatedDescriptionPresent = hasDiagnosticValue(recommendation.translatedDescription);
    row.profileSafetyHasKnownConflict = recommendation.profileSafety.hasKnownConflict;
    row.profileSafetyUncertainForAllergy = recommendation.profileSafety.uncertainForAllergy;
    row.profileSafetyConflictReason = recommendation.profileSafety.conflictReason
      ? truncateDiagnosticValue(recommendation.profileSafety.conflictReason)
      : null;
    row.reason = row.reason ?? truncateDiagnosticValue(recommendation.reason);
  });

  console.info(`[GUSTARO_2STEP_MAIN_DIAG] ${JSON.stringify({
    runId,
    resultSummary: response.resultSummary,
    rows: Array.from(rows.values())
  })}`);
}

async function applyMainDishVerifierSafety(
  response: {
    allDishes: MainDishAIAnalyzedDish[];
    removedDishes: MainDishAIRemovedDish[];
    safeCandidates: MainDishAISafeCandidate[];
    recommendations: MainDishAIRecommendation[];
    resultSummary: MainDishAIResultSummary;
  },
  profile: UserProfile,
  runId?: string,
  signal?: AbortSignal
) {
  const restrictions = buildRecommendationSafetyRestrictions(profile);

  if (restrictions.length === 0 || response.safeCandidates.length === 0) {
    logDevAnalyzeTiming({
      runId,
      phase: "api.safety_verifier_request",
      durationMs: 0,
      candidateCount: response.safeCandidates.length,
      restrictionCount: restrictions.length,
      success: true
    });
    return response;
  }

  const candidates = response.safeCandidates.map((candidate, index) => ({
    ...candidate,
    id: `candidate_${index}`
  }));
  const verifierCandidates = candidates.map((candidate) => ({
    id: candidate.id,
    nameOriginal: candidate.nameOriginal,
    descriptionOriginal: candidate.descriptionOriginal
  }));
  const verifierStartedAt = Date.now();
  const verifierResponse = await verifyRecommendationSafetyAI({
    restrictions,
    candidates: verifierCandidates,
    runId,
    signal
  }).catch(() => ({ candidates: [] }));
  logDevAnalyzeTiming({
    runId,
    phase: "api.safety_verifier_request",
    durationMs: Date.now() - verifierStartedAt,
    candidateCount: verifierCandidates.length,
    restrictionCount: restrictions.length,
    sdkRetries: "not_exposed",
    success: true
  });

  const validationStartedAt = Date.now();
  const verifierResult = filterSafeRecommendationCandidates({
    restrictions,
    candidates,
    response: verifierResponse
  });
  logVerifierDecisionDiagnostics({
    restrictions,
    candidates,
    response: verifierResponse,
    validation: verifierResult.validation,
    runId
  });
  logDevAnalyzeTiming({
    runId,
    phase: "api.safety_verifier_validation",
    durationMs: Date.now() - validationStartedAt,
    candidateCount: candidates.length,
    restrictionCount: restrictions.length,
    success: true
  });
  const safeCandidates = verifierResult.candidates.map(({ id: _id, ...candidate }) => candidate);

  if (safeCandidates.length === response.safeCandidates.length) {
    return response;
  }

  const rebuildStartedAt = Date.now();
  const recommendations = rebuildMainDishRecommendationsFromSafeCandidates({
    safeCandidates
  });
  logDevAnalyzeTiming({
    runId,
    phase: "api.candidate_filter_and_rebuild",
    durationMs: Date.now() - rebuildStartedAt,
    candidateCount: safeCandidates.length,
    success: true
  });

  return {
    ...response,
    removedDishes: [
      ...response.removedDishes,
      ...verifierResult.validation
        .filter((result) => !result.safe)
        .map((result): MainDishAIRemovedDish => ({
          nameOriginal: candidates.find((candidate) => candidate.id === result.candidateId)?.nameOriginal ?? result.candidateId,
          matchedProfileValue: "Safety-Verifier",
          reason: "Nicht ausreichend sicher verifiziert."
        }))
    ],
    safeCandidates,
    recommendations,
    resultSummary: {
      ...response.resultSummary,
      removedDishCount: response.resultSummary.removedDishCount + verifierResult.validation.filter((result) => !result.safe).length,
      safeCandidateCount: safeCandidates.length,
      recommendationCount: recommendations.length,
      lessThanThreeReason: recommendations.length < 3
        ? response.resultSummary.lessThanThreeReason ?? "Weniger als drei sichere Kandidaten nach Safety-Verifier-Pruefung."
        : null
    }
  };
}

function rebuildMainDishRecommendationsFromSafeCandidates({
  safeCandidates
}: {
  safeCandidates: MainDishAISafeCandidate[];
}): MainDishAIRecommendation[] {
  const nextRecommendations: MainDishAIRecommendation[] = [];

  for (const candidate of safeCandidates) {
    const recommendation = buildRecommendationFromSafeCandidate(candidate);

    if (!recommendation) {
      continue;
    }

    nextRecommendations.push({
      ...recommendation,
      rank: nextRecommendations.length + 1
    });

    if (nextRecommendations.length >= 3) {
      break;
    }
  }

  return nextRecommendations;
}

function buildRecommendationFromSafeCandidate(candidate: MainDishAISafeCandidate): MainDishAIRecommendation | null {
  const payload = candidate.recommendationPayload;

  if (
    !payload?.nameOriginal?.trim() ||
    !payload.translatedName?.trim() ||
    !payload.reason?.trim() ||
    !payload.confidence ||
    !payload.profileSafety
  ) {
    return null;
  }

  return {
    rank: 0,
    nameOriginal: payload.nameOriginal,
    translatedName: payload.translatedName,
    descriptionOriginal: payload.descriptionOriginal,
    translatedDescription: payload.translatedDescription,
    priceRaw: payload.priceRaw ?? candidate.priceRaw,
    sourceEvidence: payload.sourceEvidence,
    sourceKind: payload.sourceKind,
    sourceUrl: payload.sourceUrl,
    sourceCategoryOriginal: payload.sourceCategoryOriginal,
    reason: payload.reason,
    confidence: payload.confidence,
    profileSafety: payload.profileSafety
  };
}

function logVerifierDecisionDiagnostics({
  restrictions,
  candidates,
  response,
  validation,
  runId
}: {
  restrictions: ReturnType<typeof buildRecommendationSafetyRestrictions>;
  candidates: Array<MainDishAISafeCandidate & { id: string }>;
  response: { candidates?: Array<{ candidateId?: string; checks?: Array<{ restrictionId?: string; verdict?: string; evidence?: string | null; source?: string | null }> }> };
  validation: Array<{ candidateId: string; safe: boolean; reason?: string }>;
  runId?: string;
}) {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  const responseByCandidateId = new Map<string, NonNullable<typeof response.candidates>[number]>();
  for (const candidate of Array.isArray(response.candidates) ? response.candidates : []) {
    const candidateId = candidate.candidateId?.trim();

    if (candidateId) {
      responseByCandidateId.set(candidateId, candidate);
    }
  }

  const validationByCandidateId = new Map(validation.map((result) => [result.candidateId, result]));

  for (const candidate of candidates) {
    const responseCandidate = responseByCandidateId.get(candidate.id);
    const checksByRestrictionId = new Map<string, NonNullable<NonNullable<typeof response.candidates>[number]["checks"]>[number]>();
    for (const check of Array.isArray(responseCandidate?.checks) ? responseCandidate.checks : []) {
      const restrictionId = check.restrictionId?.trim();

      if (restrictionId) {
        checksByRestrictionId.set(restrictionId, check);
      }
    }

    const validationResult = validationByCandidateId.get(candidate.id);

    for (const restriction of restrictions) {
      const check = checksByRestrictionId.get(restriction.id);
      const evidence = check?.evidence?.trim() ?? "";
      const source = check?.source === "name" || check?.source === "description" ? check.source : null;
      const evidenceValid = check?.verdict === "conflict"
        ? Boolean(evidence && source && candidateContainsEvidence(candidate, evidence, source))
        : undefined;

      console.info(`[GUSTARO_SAFETY_VERIFIER_DECISION] ${[
        `runId=${runId ?? ""}`,
        `candidateId=${candidate.id}`,
        `candidateName=${candidate.nameOriginal.replace(/\s+/g, "_")}`,
        `restrictionId=${restriction.id}`,
        `restrictionType=${restriction.type}`,
        `restrictionLabel=${restriction.label.replace(/\s+/g, "_")}`,
        `verdict=${check?.verdict ?? "missing"}`,
        `reason=${validationResult?.reason ?? "safe"}`,
        evidenceValid === undefined ? null : `evidenceValid=${evidenceValid}`,
        evidence ? `evidence=${evidence.replace(/\s+/g, "_")}` : null,
        source ? `source=${source}` : null
      ].filter(Boolean).join(" ")}`);
    }
  }
}

function hasDiagnosticValue(value: string | null | undefined) {
  return Boolean(value?.trim());
}

function truncateDiagnosticValue(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 120 ? `${normalized.slice(0, 117)}...` : normalized;
}

function normalizeDiagnosticName(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
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

function buildMainDishPrompt({
  profile,
  situation,
  requestedDishRoles,
  preferredDishRole,
  targetLocale,
  targetLanguage
}: {
  profile: UserProfile;
  situation?: Situation;
  requestedDishRoles?: RequestedDishRole[];
  preferredDishRole?: PreferredDishRole;
  targetLocale: string;
  targetLanguage: string;
}) {
  const roleAssignment = buildRequestedDishRoleAssignment(requestedDishRoles);
  const rolePreferenceAssignment = buildPreferredDishRoleAssignment(preferredDishRole, roleAssignment);
  const activePreferences = getActivePreferenceValues(profile);
  const searchAssignment = buildActivePreferenceSearchAssignment(activePreferences);
  const structuredAssignment = buildStructuredMainDishAssignment({
    profile,
    situation,
    roleAssignment,
    activePreferences,
    searchAssignment,
    targetLocale
  });

  return [
    "Du bist GustaroAI in der neuen 2+2-AI-Architektur.",
    "Du bist der Main-AI-Concierge fuer rollenbasierte Speisekartenempfehlungen.",
    "Du bekommst Profil, Gerichtsrollen, Regeln und Speisekarte vollstaendig strukturiert.",
    `Liefere bis zu 3 sichere Empfehlungen aus diesem Rollenraum: ${roleAssignment.label}.`,
    `Aufgabe: Bilde zuerst einen sicheren Kandidatenraum aus ${roleAssignment.label} und waehle erst daraus bis zu 3 echte Gerichte aus.`,
    "Arbeite in dieser Reihenfolge:",
    "1. Analysiere die Speisekarte.",
    `2. Ermittle alle verfuegbaren ${roleAssignment.analysisTarget} mit Gerichtsname und vollstaendiger sichtbarer Beschreibung, soweit aus der Quelle erkennbar.`,
    "3. Pruefe fuer jedes Gericht immer Gerichtsname UND vollstaendige sichtbare Beschreibung auf aktive Allergene.",
    "4. Pruefe fuer jedes Gericht immer Gerichtsname UND vollstaendige sichtbare Beschreibung auf aktive Ausschluesse oder aktive Unvertraeglichkeiten aus customExclusions.",
    "5. Entferne alle Gerichte, die mindestens einen aktiven Allergenwert enthalten.",
    "6. Entferne alle Gerichte, die mindestens einen aktiven Ausschluss oder eine aktive Unvertraeglichkeit aus customExclusions enthalten.",
    "7. Bewerte nur die verbleibenden sicheren Gerichte anhand der Vorlieben aus primaryLikes.",
    "8. Liefere genau 3 Empfehlungen, wenn mindestens 3 sichere Gerichte im angeforderten Rollenraum vorhanden sind.",
    "9. Wenn weniger als 3 sichere Gerichte vorhanden sind, liefere nur die sicheren Gerichte und erklaere im JSON resultSummary.lessThanThreeReason warum weniger als 3 moeglich waren.",
    `Wenn mindestens 3 sichere Gerichte im Rollenraum ${roleAssignment.label} in der Speisekarte vorhanden sind, musst du genau 3 Empfehlungen liefern.`,
    `Liefere nur dann weniger als 3 Empfehlungen, wenn die Speisekarte nach verbindlicher Pruefung harter Tabus tatsaechlich weniger als 3 sichere Gerichte im Rollenraum ${roleAssignment.label} enthaelt.`,
    `Sprache fuer nutzerseitige Ausgaben: ${targetLanguage} (${targetLocale}).`,
    "",
    "Strukturierter Auftrag:",
    JSON.stringify(structuredAssignment, null, 2),
    "",
    "Verbindliche Regeln:",
    ...roleAssignment.rules,
    ...rolePreferenceAssignment.rules,
    ...searchAssignment.rules,
    "- Alle Ausschluesse, Unvertraeglichkeiten und aktiven Allergene sind harte Tabus.",
    "- Harte Tabus stehen immer ueber Vorlieben, Situation, Beliebtheit, Preis, Kategorie oder Restaurantklassikern.",
    "- Vorlieben sind positive Orientierung; sie duerfen harte Tabus niemals ueberstimmen.",
    "- Ein Gericht darf niemals empfohlen werden, wenn es eine aktive Allergie, einen aktiven Ausschluss oder eine erkannte harte Unvertraeglichkeit enthaelt.",
    "- Fuer diese harte Konfliktpruefung musst du immer den Gerichtsnamen UND die vollstaendige sichtbare Beschreibung analysieren.",
    "- Wenn Gerichtsname und Beschreibung unterschiedlich wirken, ist die Beschreibung fuer Konflikte massgeblich.",
    "- Ein Vorkommen eines aktiven Ausschlussbegriffs in der Beschreibung fuehrt immer zur Entfernung des Gerichts.",
    "- Entfernte Gerichte muessen in removedDishes mit matchedProfileValue und reason nachvollziehbar auftauchen.",
    "- removedDishes muss auch Gerichte enthalten, bei denen ein aktiver Ausschluss nur in der Beschreibung, nicht aber im Namen vorkommt.",
    "- safeCandidates darf nur Gerichte enthalten, die nach deiner Konfliktpruefung sicher sind.",
    "- recommendations darf nur aus safeCandidates ausgewaehlt werden.",
    `- Wenn ein bevorzugter Kandidat wegen harter Tabus nicht passt, waehle ein anderes sicheres Gericht aus dem Rollenraum ${roleAssignment.label} aus der Speisekarte.`,
    `- Reduziere nicht freiwillig auf 0, 1 oder 2 Empfehlungen, solange mindestens 3 sichere Gerichte im Rollenraum ${roleAssignment.label} verfuegbar sind.`,
    "- Brich die Auswahl nicht ab, nur weil ein Kandidat blockiert ist; suche aktiv nach einem sicheren Ersatzgericht.",
    "- Empfiehl kein Gericht mit bekanntem oder sichtbarem Profilkonflikt.",
    "- Entferne Gerichte nur, wenn ein aktiver harter Profilwert im sichtbaren Gerichtsnamen oder in der sichtbaren Beschreibung erkennbar vorkommt.",
    "- Entferne kein Gericht wegen blosser Vermutung, unbekannter Zubereitung oder Formulierungen wie koennte enthalten.",
    "- Wenn kein sichtbarer Konflikt erkennbar ist, darf das Gericht nicht allein wegen Unsicherheit in removedDishes landen.",
    "- Wenn Sahne, Rahm, Cream oder Panna in Ausschluessen, Unvertraeglichkeiten oder Allergenen aktiv ist: kein Gericht mit Sahne, Sahnesosse, Sahnesauce, Rahm, Cream, Cream sauce oder Panna empfehlen.",
    "- Beispiel Modo Mio: Name Spaghetti al Tartufo wirkt unkritisch, aber die Beschreibung enthaelt Pecorino-Trueffel-Sahnesauce; bei Ausschluss Sahne muss dieses Gericht entfernt werden.",
    `- Nutze nur echte Gerichte aus dem Rollenraum ${roleAssignment.label}, die belegbar in der Speisekarte vorkommen.`,
    "- Keine rollenfremden Gerichte, Desserts, Getraenke, Beilagen, Zutaten oder Beschreibungsteile empfehlen.",
    "- Wenn ein Risiko in einem gelieferten Ergebnis erkannt wird, muss profileSafety dies korrekt markieren.",
    "- profileSafety.hasKnownConflict muss fuer jede Empfehlung false sein.",
    "- profileSafety.checkedAgainst muss die aktiven harten Profilwerte enthalten, gegen die du die Empfehlung geprueft hast.",
    "- Ein Gericht darf nicht wegen fehlendem Preis ausgeschlossen werden.",
    "- Wenn fuer einen sichtbaren Menueeintrag ein Preis mit sichtbarer Waehrung sichtbar und eindeutig diesem Gericht zuordenbar ist, muss der Preis exakt aus der Quelle uebernommen werden.",
    "- Dieser Preisvertrag gilt identisch fuer allDishes.price, safeCandidates.priceRaw, recommendationPayload.priceRaw und recommendations.priceRaw.",
    "- allDishes.price, safeCandidates.priceRaw, recommendationPayload.priceRaw und recommendations.priceRaw muessen immer string oder null sein.",
    "- Verwende null, wenn fuer diesen konkreten Menueeintrag kein Preis mit sichtbarer Waehrung sichtbar oder nicht eindeutig zuordenbar ist.",
    "- Verwende niemals 0, \"0\", \"N/A\", \"unbekannt\" oder leere Strings als Fehlwert fuer fehlende Preise.",
    "- sourceEvidence soll geliefert werden, wenn ein kurzer Beleg sicher moeglich ist.",
    "- sourceEvidence darf null oder fehlen, wenn kein knapper Beleg sicher angegeben werden kann.",
    "- Wenn der sichtbare Menueeintrag eine echte Beschreibung enthaelt, gib descriptionOriginal als vollstaendige originale Beschreibung aus.",
    "- translatedDescription ist optional und darf nur gesetzt werden, wenn descriptionOriginal vorhanden ist.",
    `- translatedDescription muss descriptionOriginal treu in ${targetLanguage} (${targetLocale}) wiedergeben.`,
    "- Wenn keine echte Beschreibung sichtbar ist, lasse descriptionOriginal und translatedDescription null oder weg.",
    "- Erfinde keine Beschreibung, Zutaten oder Details.",
    "- reason und scoreReason duerfen nur sichtbaren Gerichtsnamen, sichtbare Kategorie und aktive Profilvorlieben verwenden.",
    "- Behaupte in reason oder scoreReason keine Zutaten, Fleischarten, Geschmack, Beliebtheit oder Zubereitung, wenn sie nicht sichtbar im Gerichtsnamen, in der Kategorie oder in der echten sichtbaren Beschreibung belegt sind.",
    "- translatedName ist Pflicht und ist die nutzerseitige Anzeigeuebersetzung in der Zielsprache.",
    `- translatedName muss in ${targetLanguage} (${targetLocale}) formuliert sein.`,
    "- Jede Empfehlung muss einen display-sicheren translatedName enthalten.",
    "- Bei de-DE muss translatedName eine deutsche Anzeigeuebersetzung oder ein deutscher, fuer Nutzer verstaendlicher Gloss sein.",
    "- Kopiere nameOriginal nicht einfach als translatedName, wenn der Originalname fremdsprachig ist; liefere dann eine knappe belegbare Anzeigeuebersetzung.",
    "- Eigennamen oder unveraenderliche Gerichtstitel duerfen teilweise erhalten bleiben, aber translatedName muss trotzdem in der Zielsprache verstaendlich sein.",
    "- Uebersetze nur, was durch sourceEvidence oder Speisekartentext belegbar ist.",
    "- Erfinde keine Zutaten und fuege keine freien Ausschmueckungen hinzu.",
    "- Keine nachgelagerte Qualitaetskontrolle voraussetzen: die Auswahl muss in diesem Call korrekt sein.",
    "- Kein PDF-Fuzzy-Matching voraussetzen: entscheide nur aus dem sichtbaren Speisekartenkontext.",
    "",
    buildMainDishProfileContext(profile, situation, roleAssignment, activePreferences, searchAssignment),
    "",
    "Antwort ausschliesslich als valides JSON ohne Markdown:",
    "{",
    '  "allDishes": [',
    "    {",
    '      "nameOriginal": "exakter Originalname aus der Speisekarte",',
    '      "descriptionOriginal": "vollstaendige sichtbare Originalbeschreibung falls vorhanden, sonst null",',
    '      "price": "exakter Preis mit sichtbarer Waehrung, wenn eindeutig diesem Gericht zuordenbar, sonst null",',
    '      "detectedConflicts": ["aktive Profilwerte, die in Name oder Beschreibung erkannt wurden"],',
    '      "isSafe": true',
    "    }",
    "  ],",
    '  "removedDishes": [',
    "    {",
    '      "nameOriginal": "entferntes Gericht",',
    '      "matchedProfileValue": "aktiver Ausschluss oder aktives Allergen",',
    '      "reason": "kurzer Grund in der Zielsprache, inklusive ob der Konflikt im Namen oder in der Beschreibung stand"',
    "    }",
    "  ],",
    '  "safeCandidates": [',
    "    {",
    '      "nameOriginal": "sicherer Kandidat",',
    '      "descriptionOriginal": "vollstaendige sichtbare Originalbeschreibung falls vorhanden, sonst null",',
    '      "scoreReason": "kurze Bewertung in der Zielsprache; nur sichtbarer Name, sichtbare Kategorie und aktive Profilvorlieben, keine unbelegten Details",',
    '      "translatedName": "Anzeigeuebersetzung fuer moegliches Nachruecken, falls sicher belegbar",',
    '      "translatedDescription": "treue Uebersetzung der Originalbeschreibung falls vorhanden, sonst null",',
    '      "priceRaw": "exakter Preis mit sichtbarer Waehrung, wenn eindeutig diesem Gericht zuordenbar, sonst null",',
    '      "sourceEvidence": "kurzer belegender Originalausschnitt aus der Speisekarte",',
    '      "sourceKind": "pdf | html | image | text | unknown",',
    '      "sourceUrl": "Quellen-URL falls bekannt, sonst null",',
    '      "sourceCategoryOriginal": "sichtbare Kategorie falls hilfreich, sonst null",',
    '      "confidence": "high | medium | low",',
    '      "profileSafety": {',
    '        "hasKnownConflict": false,',
    '        "uncertainForAllergy": false,',
    '        "conflictReason": null,',
    '        "checkedAgainst": ["aktive harte Profilwerte"]',
    "      },",
    '      "recommendationPayload": {',
    '        "nameOriginal": "derselbe Originalname dieses sicheren Kandidaten",',
    '        "translatedName": "display-sichere nutzerseitige Anzeigeuebersetzung in der Zielsprache",',
    '        "descriptionOriginal": "vollstaendige Originalbeschreibung falls sichtbar, sonst null",',
    '        "translatedDescription": "treue Uebersetzung der Originalbeschreibung falls vorhanden, sonst null",',
    '        "priceRaw": "exakter Preis mit sichtbarer Waehrung, wenn eindeutig diesem Gericht zuordenbar, sonst null",',
    '        "sourceEvidence": "kurzer belegender Originalausschnitt aus der Speisekarte",',
    '        "sourceKind": "pdf | html | image | text | unknown",',
    '        "sourceUrl": "Quellen-URL falls bekannt, sonst null",',
    '        "sourceCategoryOriginal": "sichtbare Kategorie falls hilfreich, sonst null",',
    '        "reason": "kurze profilbezogene Begruendung in der Zielsprache; nur sichtbarer Name, sichtbare Kategorie und aktive Profilvorlieben, keine unbelegten Details",',
    '        "confidence": "high | medium | low",',
    '        "profileSafety": {',
    '          "hasKnownConflict": false,',
    '          "uncertainForAllergy": false,',
    '          "conflictReason": null,',
    '          "checkedAgainst": ["aktive harte Profilwerte"]',
    "        }",
    "      }",
    "    }",
    "  ],",
    '  "recommendations": [',
    "    {",
    '      "rank": 1,',
    '      "nameOriginal": "exakter Originalname aus der Speisekarte",',
    '      "translatedName": "display-sichere nutzerseitige Anzeigeuebersetzung in der Zielsprache",',
    '      "descriptionOriginal": "vollstaendige Originalbeschreibung falls sichtbar, sonst null",',
    '      "translatedDescription": "treue Uebersetzung der Originalbeschreibung falls vorhanden, sonst null",',
    '      "priceRaw": "exakter Preis mit sichtbarer Waehrung, wenn eindeutig diesem Gericht zuordenbar, sonst null",',
    '      "sourceEvidence": "kurzer belegender Originalausschnitt aus der Speisekarte",',
    '      "sourceKind": "pdf | html | image | text | unknown",',
    '      "sourceUrl": "Quellen-URL falls bekannt, sonst null",',
    '      "sourceCategoryOriginal": "sichtbare Kategorie falls hilfreich, sonst null",',
    '      "reason": "kurze profilbezogene Begruendung in der Zielsprache; nur sichtbarer Name, sichtbare Kategorie und aktive Profilvorlieben, keine unbelegten Details",',
    '      "confidence": "high | medium | low",',
    '      "profileSafety": {',
    '        "hasKnownConflict": false,',
    '        "uncertainForAllergy": false,',
    '        "conflictReason": null,',
    '        "checkedAgainst": ["aktive harte Profilwerte"]',
    "      }",
    "    }",
    "  ],",
    '  "resultSummary": {',
    '    "allDishCount": 0,',
    '    "removedDishCount": 0,',
    '    "safeCandidateCount": 0,',
    '    "recommendationCount": 0,',
    '    "lessThanThreeReason": null',
    "  }",
    "}"
  ].join("\n");
}

function buildMainDishProfileContext(
  profile: UserProfile,
  situation: Situation | undefined,
  roleAssignment: RequestedDishRoleAssignment,
  positivePreferences: string[],
  searchAssignment: ActivePreferenceSearchAssignment
) {
  const hardExclusions = uniqueValues(arrayValue(profile.customExclusions));
  const hardAllergens = uniqueValues(arrayValue(profile.allergens));
  return [
    "Nutzerprofil fuer diesen Main-AI-Call:",
    `- Ausgabesprache nur fuer nutzerseitige Texte, kein Auswahlkriterium: ${profile.outputLocale || "de-DE"}`,
    `- Angeforderter Gerichtsrollenraum: ${roleAssignment.label} (${roleAssignment.roles.join(", ")})`,
    `- Kompatibilitaets-Situation alter Clients, kein aktiver Auswahlmodus: ${situation || "nicht angegeben"}`,
    `- Anzahl aktiver heutiger Vorlieben/Wunschrichtungen: ${positivePreferences.length}`,
    `- Aktive heutige Vorlieben/Wunschrichtungen: ${listOrNone(positivePreferences)}`,
    `- Aktiver Suchauftrag: ${searchAssignment.instruction}`,
    `- Aktiver Suchraum: ${roleAssignment.label}; innerhalb davon ${searchAssignment.searchSpaceLabel}`,
    `- Aktive Ausschluesse und Unvertraeglichkeiten: ${listOrNone(hardExclusions)}`,
    `- Aktive Allergene: ${listOrNone(hardAllergens)}`,
    "- Harte Ausschluesse, Allergien und Unvertraeglichkeiten sind wichtiger als Vorlieben und Rollenwahl.",
    "- Bei harten Ausschluessen, Allergien und Unvertraeglichkeiten gilt: Nur sichtbare Konflikte aus Gerichtsname oder Beschreibung entfernen; nicht wegen blosser Vermutung entfernen.",
    "- Aktive Vorlieben priorisieren nur innerhalb des angeforderten Rollenraums.",
    "- Diese Signale stammen aus dem aktuellen Request-Profil und duerfen nicht aus frueheren Analysen ersetzt werden."
  ].join("\n");
}

function buildStructuredMainDishAssignment({
  profile,
  situation,
  roleAssignment,
  activePreferences,
  searchAssignment,
  targetLocale
}: {
  profile: UserProfile;
  situation?: Situation;
  roleAssignment: RequestedDishRoleAssignment;
  activePreferences: string[];
  searchAssignment: ActivePreferenceSearchAssignment;
  targetLocale: string;
}) {
  const hardExclusions = uniqueValues(arrayValue(profile.customExclusions));
  const hardAllergens = uniqueValues(arrayValue(profile.allergens));

  return {
    analyse: {
      profil: {
        vorlieben: activePreferences,
        ausschluesse_und_unvertraeglichkeiten: hardExclusions,
        allergene: hardAllergens,
        ausgabesprache: targetLocale
      },
      situation: {
        modus: situation || "nicht angegeben",
        kompatibilitaet_nur_fuer_alte_clients: true
      },
      regeln: {
        anzahl_gerichte: 3,
        angeforderte_gerichtrollen: roleAssignment.roles,
        rollenraum_label: roleAssignment.label,
        zuerst_alle_erkennbaren_gerichte_im_rollenraum_analysieren: true,
        rollenfremde_gerichte_aus_kandidatenraum_entfernen: true,
        keine_rollenfremde_auffuellung: true,
        gerichtsnamen_und_vollstaendige_sichtbare_beschreibungen_pruefen: true,
        beschreibung_ist_bei_konflikten_massgeblich: true,
        ausschluss_in_beschreibung_fuehrt_zur_entfernung: true,
        konfliktgerichte_entfernen_bevor_empfohlen_wird: true,
        empfehlungen_nur_aus_sicheren_kandidaten: true,
        genau_3_wenn_mindestens_3_sichere_gerichte_vorhanden: true,
        nicht_freiwillig_auf_weniger_als_3_reduzieren: true,
        ersatzgericht_waehlen_wenn_kandidat_blockiert_ist: true,
        harte_ausschluesse_sind_verbindlich: true,
        allergene_sind_verbindlich: true,
        unvertraeglichkeiten_sind_verbindlich: true,
        vorlieben_sind_positive_orientierung: true,
        vorlieben_duerfen_harte_ausschluesse_nicht_ueberstimmen: true,
        nur_speisekarteninformationen: true,
        beschreibung_nur_wenn_vorhanden: true,
        keine_beschreibung_erfinden: true,
        translated_name_pflicht_und_display_sicher: true,
        translated_name_darf_bei_fremdsprachigem_original_nicht_blosse_kopie_sein: true,
        removed_dishes_mit_matched_profile_value_ausgeben: true,
        less_than_three_reason_erforderlich_wenn_weniger_als_3_empfehlungen: true,
        keine_nachgelagerte_qualitaetskontrolle: true,
        kein_pdf_fuzzy_matching: true
      },
      suchauftrag: {
        instruktion: searchAssignment.instruction,
        suchraum: searchAssignment.searchSpaceLabel
      },
      speisekarte: "siehe Quellenkontext/Speisekartentext oder angehaengte Speisekartendateien"
    },
    auftrag: `Analysiere zuerst alle erkennbaren Gerichte im Rollenraum ${roleAssignment.label}, entferne rollenfremde Gerichte sowie Gerichte mit aktiven Ausschluessen oder Allergenen, bilde daraus sichere Kandidaten und waehle erst danach genau 3 Empfehlungen, wenn mindestens 3 sichere Gerichte im Rollenraum vorhanden sind.`
  };
}

type RequestedDishRoleAssignment = {
  roles: RequestedDishRole[];
  label: string;
  analysisTarget: string;
  mapperCategory: string;
  primaryRole: RequestedDishRole;
  dishRole: "starter" | "main";
  rules: string[];
};

function buildRequestedDishRoleAssignment(values?: RequestedDishRole[]): RequestedDishRoleAssignment {
  const roles = normalizeRequestedDishRoles(values);

  if (roles.includes("starter") || roles.includes("salad")) {
    return {
      roles: ["starter", "salad"],
      label: "Vorspeisen und Salate",
      analysisTarget: "Vorspeisen und Salate",
      mapperCategory: "AI-Vorspeisen-/Salatempfehlung",
      primaryRole: "starter",
      dishRole: "starter",
      rules: [
        "- Der aktive Rollenraum ist ausschliesslich starter und salad.",
        "- Identifiziere sichtbare Vorspeisen, Antipasti, Suppen nur wenn als Vorspeise erkennbar, und Salate.",
        "- Hauptgerichte, Pasta-/Pizza-/Fleisch-/Fisch-Hauptspeisen und vollwertige Hauptplatten duerfen nicht als Ersatz empfohlen werden.",
        "- Wenn weniger als 3 sichere Vorspeisen oder Salate vorhanden sind, liefere weniger als 3 Empfehlungen statt mit Hauptgerichten aufzufuellen."
      ]
    };
  }

  return {
    roles: ["main"],
    label: "Hauptspeisen",
    analysisTarget: "Hauptspeisen",
    mapperCategory: "AI-Hauptempfehlung",
    primaryRole: "main",
    dishRole: "main",
    rules: [
      "- Der aktive Rollenraum ist ausschliesslich main.",
      "- Identifiziere sichtbare Hauptgerichte und vollwertige Hauptspeisen.",
      "- Vorspeisen, Salate als reine Vorspeisen, Desserts, Getraenke und Beilagen duerfen nicht als Ersatz empfohlen werden.",
      "- Wenn weniger als 3 sichere Hauptspeisen vorhanden sind, liefere weniger als 3 Empfehlungen statt mit Vorspeisen oder Salaten aufzufuellen."
    ]
  };
}

function buildPreferredDishRoleAssignment(
  preferredDishRole: PreferredDishRole | undefined,
  roleAssignment: RequestedDishRoleAssignment
) {
  if (preferredDishRole !== "starter" || !roleAssignment.roles.includes("starter")) {
    return {
      rules: []
    };
  }

  return {
    rules: [
      "- Optionale Rollenpraeferenz innerhalb dieses Rollenraums: Bevorzuge sichere Vorspeisen gegenueber sicheren Salaten, wenn sie ansonsten aehnlich geeignet sind.",
      "- Diese Praeferenz darf Safety, harte Profilwerte oder den verbindlichen Rollenraum niemals ueberstimmen.",
      "- Salate bleiben erlaubt und duerfen empfohlen werden.",
      "- Liefere nicht weniger Empfehlungen nur weil weniger Vorspeisen vorhanden sind; fuelle verbleibende Plaetze mit sicheren Salaten auf.",
      "- Innerhalb derselben Rolle bleiben primaryLikes fuer das Ranking aktiv."
    ]
  };
}

function normalizeRequestedDishRoles(values?: RequestedDishRole[]): RequestedDishRole[] {
  const allowed = new Set<RequestedDishRole>(["starter", "salad", "main"]);
  const roles = Array.isArray(values)
    ? values.filter((value): value is RequestedDishRole => allowed.has(value))
    : [];

  if (roles.includes("starter") || roles.includes("salad")) {
    return ["starter", "salad"];
  }

  return ["main"];
}

type ActivePreferenceSearchAssignment = {
  kind: "none" | "single" | "multiple";
  instruction: string;
  searchSpaceLabel: string;
  rules: string[];
};

function getActivePreferenceValues(profile: UserProfile) {
  return uniqueValues([
    ...arrayValue(profile.primaryLikes)
  ]);
}

function buildActivePreferenceSearchAssignment(values: string[]): ActivePreferenceSearchAssignment {
  if (values.length === 0) {
    return {
      kind: "none",
      instruction: "Empfiehl genau 3 passende Gerichte aus dem angeforderten Rollenraum, wenn mindestens 3 sichere Gerichte vorhanden sind.",
      searchSpaceLabel: "allgemeine passende Gerichte im angeforderten Rollenraum",
      rules: [
        "- Es gibt keine aktive Wunschrichtung; waehle genau 3 passende echte Gerichte aus dem angeforderten Rollenraum, wenn mindestens 3 sichere Gerichte vorhanden sind.",
        "- Liefere nur weniger als 3 Empfehlungen, wenn nach harter Tabu-Pruefung tatsaechlich weniger sichere Gerichte im angeforderten Rollenraum vorhanden sind.",
        "- Harte Ausschluesse, Allergien und Unvertraeglichkeiten bleiben verbindlich."
      ]
    };
  }

  if (values.length === 1) {
    const searchTarget = toSearchTargetLabel(values[0]!);

    return {
      kind: "single",
      instruction: `Empfiehl genau 3 Gerichte aus dem angeforderten Rollenraum und priorisiere dabei den aktiven Suchraum: ${searchTarget}.`,
      searchSpaceLabel: searchTarget,
      rules: [
        `- Wenn die Speisekarte genuegend passende ${searchTarget} enthaelt, muessen alle Empfehlungen ${searchTarget} sein.`,
        `- Wenn weniger passende ${searchTarget} sicher erkennbar sind, ergaenze mit anderen sicheren Gerichten aus dem angeforderten Rollenraum, bis 3 Empfehlungen erreicht sind.`,
        "- Liefere nur weniger als 3 Empfehlungen, wenn nach harter Tabu-Pruefung insgesamt weniger als 3 sichere Gerichte im angeforderten Rollenraum vorhanden sind.",
        "- Fuelle nicht mit neutralen Kategorien ausserhalb des Suchraums auf.",
        "- Erfinde nichts.",
        "- Nutze nur echte Gerichte aus der Speisekarte."
      ]
    };
  }

  const searchTargets = uniqueValues(values.map(toSearchTargetLabel));
  const searchSpace = joinSearchTargets(searchTargets);

  return {
    kind: "multiple",
    instruction: `Empfiehl genau 3 Gerichte aus dem angeforderten Rollenraum und priorisiere dabei den aktiven Suchraum: ${searchSpace}.`,
    searchSpaceLabel: searchSpace,
    rules: [
      "- Empfehlungen muessen aus diesem Suchraum stammen, wenn passende Gerichte vorhanden sind.",
      "- Fuelle nicht mit neutralen Kategorien ausserhalb des Suchraums auf.",
      "- Wenn nur weniger sichere Treffer im Suchraum erkennbar sind, ergaenze mit anderen sicheren Gerichten aus dem angeforderten Rollenraum, bis 3 Empfehlungen erreicht sind.",
      "- Liefere nur weniger als 3 Empfehlungen, wenn nach harter Tabu-Pruefung insgesamt weniger als 3 sichere Gerichte im angeforderten Rollenraum vorhanden sind.",
      "- Erfinde nichts.",
      "- Nutze nur echte Gerichte aus der Speisekarte."
    ]
  };
}

function toSearchTargetLabel(value: string) {
  const normalized = normalizePreference(value);

  if (normalized.includes("pizza")) return "Pizzen";
  if (/\b(?:pasta|nudel|nudeln|spaghetti|tagliatelle|linguine|penne|rigatoni|gnocchi)\b/.test(normalized)) {
    return "Pasta- oder Nudelgerichte";
  }
  if (/\b(?:salat|salate|salad|salads)\b/.test(normalized)) {
    return "Hauptgerichte im angeforderten Rollenraum";
  }
  if (/\b(?:fleisch|meat|rind|kalb|schwein|gefluegel|geflugel|huhn|haehnchen|hahnchen|lamm|steak)\b/.test(normalized)) {
    return "Fleischgerichte";
  }
  if (/\b(?:fisch|fish|seafood|meeresfruechte|meeresfruchte|garnelen|scampi|lachs|thunfisch)\b/.test(normalized)) {
    return "Fischgerichte oder Seafood";
  }
  if (/\b(?:vegetarisch|vegetarian|veggie)\b/.test(normalized)) {
    return "vegetarische Gerichte";
  }
  if (/\b(?:gemuese|gemuse|vegetable|vegetables)\b/.test(normalized)) {
    return "gemuesebasierte Gerichte";
  }
  if (/\b(?:ei|eier|egg|eggs|uovo|uova|oeuf|oeufs|huevo|huevos)\b/.test(normalized)) {
    return "eibasierte Gerichte";
  }
  if (/\b(?:kaese|kase|cheese|formaggio)\b/.test(normalized)) {
    return "kaesebetonte Hauptgerichte";
  }

  return value.trim();
}

function joinSearchTargets(values: string[]) {
  if (values.length <= 1) return values[0] ?? "aktive Vorlieben";
  if (values.length === 2) return `${values[0]} oder ${values[1]}`;

  return `${values.slice(0, -1).join(", ")} oder ${values[values.length - 1]}`;
}

function arrayValue(values?: string[]) {
  return Array.isArray(values) ? values.filter((value) => value.trim().length > 0) : [];
}

function uniqueValues(values: string[]) {
  return values.reduce<string[]>((result, value) => {
    return result.some((item) => normalizePreference(item) === normalizePreference(value)) ? result : [...result, value];
  }, []);
}

function normalizePreference(value: string) {
  return value
    .toLowerCase()
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function listOrNone(values: string[]) {
  return values.length > 0 ? values.join(", ") : "keine";
}
