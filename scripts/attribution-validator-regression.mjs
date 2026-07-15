import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function loadAttributionValidatorModule({ verdicts = {}, capturedChecks = [], throwOnVerify = false } = {}) {
  const sourcePath = path.resolve("apps/api/src/recommendation/attributionValidator.ts");
  const source = fs.readFileSync(sourcePath, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      strict: true
    }
  }).outputText;
  const module = { exports: {} };
  const scopedRequire = (request) => {
    if (request.endsWith("../ai/verifyAttributionEvidenceAI")) {
      return {
        verifyAttributionEvidenceAI: async ({ checks }) => {
          capturedChecks.push(...checks);

          if (throwOnVerify) {
            throw new Error("ATTRIBUTION_EVIDENCE_TIMEOUT");
          }

          return checks.map((check) => {
          const result = verdicts[`${check.profileType}|${check.profileValue}|${check.nameOriginal}`] ?? {
            verdict: "uncertain",
            profileEvidence: null,
            evidenceSource: null
          };
          const sourceText = result.evidenceSource === "name"
            ? check.nameOriginal
            : result.evidenceSource === "description"
              ? check.descriptionOriginal
              : null;
          const evidenceVisible = Boolean(result.profileEvidence && sourceText && normalizeText(sourceText).includes(normalizeText(result.profileEvidence)));

          if (result.verdict === "valid" && !evidenceVisible) {
            return {
              attributionId: check.attributionId,
              verdict: "uncertain",
              profileEvidence: null,
              evidenceSource: null
            };
          }

          return {
            attributionId: check.attributionId,
            ...result
          };
        });
        }
      };
    }

    if (request.endsWith("../ai/twoStepRecommendationDiagnostics")) {
      return {
        isAnalyzeDiagnosticsEnabled: () => true
      };
    }

    return require(request);
  };

  vm.runInNewContext(compiled, {
    exports: module.exports,
    module,
    require: scopedRequire,
    process,
    console
  }, {
    filename: sourcePath
  });

  return module.exports;
}

function normalizeText(value) {
  return String(value)
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

function loadAttributionEvidenceModule() {
  const sourcePath = path.resolve("apps/api/src/ai/verifyAttributionEvidenceAI.ts");
  const source = fs.readFileSync(sourcePath, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      strict: true
    }
  }).outputText;
  const module = { exports: {} };
  const scopedRequire = (request) => {
    if (request.endsWith("./twoStepRecommendationAIUtils")) {
      return {
        createTwoStepOpenAIClient: () => ({ responses: { create: async () => ({ output_text: "{}", usage: {} }) } }),
        getTwoStepModelForSource: () => "gpt-4o-mini",
        stripJsonFence: (value) => value
      };
    }

    if (request.endsWith("./twoStepRecommendationDiagnostics")) {
      return {
        isAnalyzeDiagnosticsEnabled: () => true
      };
    }

    return require(request);
  };

  vm.runInNewContext(compiled, {
    exports: module.exports,
    module,
    require: scopedRequire,
    process,
    console
  }, {
    filename: sourcePath
  });

  return module.exports;
}

const verdicts = {
  "preference|Rindfleisch|Entrecote di manzo danese": { verdict: "valid", profileEvidence: "manzo", evidenceSource: "name" },
  "preference|Rindfleisch|Lachsforellenfilet": { verdict: "invalid", profileEvidence: null, evidenceSource: null },
  "preference|Pommes|patatine fritte": { verdict: "valid", profileEvidence: "patatine fritte", evidenceSource: "name" },
  "preference|Rindfleisch|Говядина на гриле": { verdict: "valid", profileEvidence: "Говядина", evidenceSource: "name" },
  "preference|Rindfleisch|Говядина тушеная": { verdict: "valid", profileEvidence: "Говядина", evidenceSource: "name" },
  "preference|Huhn|Курица с овощами": { verdict: "valid", profileEvidence: "Курица", evidenceSource: "name" },
  "preference|Huhn|Утинка с картофелем": { verdict: "invalid", profileEvidence: null, evidenceSource: null },
  "exclusion|Kein Koriander|Rahm": { verdict: "invalid", profileEvidence: null, evidenceSource: null },
  "preference|Rindfleisch|Halluzinierter Beleg": { verdict: "valid", profileEvidence: "manzo", evidenceSource: "name" },
  "preference|Rindfleisch|Fehlender Beleg": { verdict: "valid", profileEvidence: null, evidenceSource: null }
};
const { validateMainDishAttributions } = loadAttributionValidatorModule({ verdicts });
const { validateAttributionEvidenceResponse } = loadAttributionEvidenceModule();

function profile(primaryLikes = ["Rindfleisch", "Pommes"], customExclusions = ["Kein Koriander"], allergens = [], outputLocale = "de-DE") {
  return {
    outputLocale,
    primaryLikes,
    customExclusions,
    allergens
  };
}

function baseResponse(overrides = {}) {
  return {
    allDishes: [],
    removedDishes: [],
    safeCandidates: [],
    recommendations: [],
    resultSummary: {
      allDishCount: 0,
      removedDishCount: 0,
      safeCandidateCount: 0,
      recommendationCount: 0,
      lessThanThreeReason: null
    },
    ...overrides
  };
}

function recommendation({
  nameOriginal,
  matchedPreferenceValue,
  descriptionOriginal = null,
  rank = 1,
  reason = "Belegt durch sichtbaren Namen und aktive Vorliebe."
}) {
  return {
    rank,
    nameOriginal,
    translatedName: nameOriginal,
    descriptionOriginal,
    translatedDescription: null,
    priceRaw: null,
    sourceEvidence: nameOriginal,
    sourceKind: "text",
    sourceUrl: null,
    sourceCategoryOriginal: null,
    matchedPreferenceValue,
    reason,
    confidence: "high",
    profileSafety: {
      hasKnownConflict: false,
      uncertainForAllergy: false,
      conflictReason: null
    }
  };
}

function safeCandidateWithPayload(item) {
  const payload = recommendation({
    ...item,
    nameOriginal: item.payloadNameOriginal ?? item.nameOriginal,
    descriptionOriginal: item.payloadDescriptionOriginal ?? item.descriptionOriginal
  });

  return {
    nameOriginal: item.nameOriginal,
    descriptionOriginal: item.descriptionOriginal ?? null,
    scoreReason: "Belegt durch sichtbaren Namen und aktive Vorliebe.",
    translatedName: item.nameOriginal,
    translatedDescription: null,
    priceRaw: null,
    sourceEvidence: item.nameOriginal,
    sourceKind: "text",
    sourceUrl: null,
    sourceCategoryOriginal: null,
    matchedPreferenceValue: item.matchedPreferenceValue,
    confidence: "high",
    profileSafety: {
      hasKnownConflict: false,
      uncertainForAllergy: false,
      conflictReason: null
    },
    recommendationPayload: payload
  };
}

{
  const result = await validateMainDishAttributions(baseResponse({
    recommendations: [
      recommendation({ nameOriginal: "Entrecote di manzo danese", matchedPreferenceValue: "Rindfleisch" })
    ],
    resultSummary: { allDishCount: 1, removedDishCount: 0, safeCandidateCount: 0, recommendationCount: 1, lessThanThreeReason: null }
  }), profile());

  assert(result.recommendations.length === 1, "Rindfleisch and visible manzo must be valid via Evidence AI");
}

{
  const result = await validateMainDishAttributions(baseResponse({
    recommendations: [
      recommendation({ nameOriginal: "Lachsforellenfilet", matchedPreferenceValue: "Rindfleisch" })
    ],
    resultSummary: { allDishCount: 1, removedDishCount: 0, safeCandidateCount: 0, recommendationCount: 1, lessThanThreeReason: null }
  }), profile());

  assert(result.recommendations.length === 1, "Invalid preference attribution must not remove a safety-safe recommendation");
  assert(result.recommendations[0]?.matchedPreferenceValue === null, "Invalid preference attribution must clear the personal preference value");
  assert(result.recommendations[0]?.reason === "Ausgewählt ohne bestätigten Bezug zu Deinen Vorlieben.", "Invalid preference attribution must use the neutral de-DE reason");
  assert(result.attributionNotConfirmed === false, "Invalid preference attribution must not mark the full run as not confirmed");
}

{
  const result = await validateMainDishAttributions(baseResponse({
    recommendations: [
      recommendation({
        nameOriginal: "Pommes",
        matchedPreferenceValue: "Pommes",
        reason: "Passt zu Rindfleisch und Schaerfe."
      })
    ],
    resultSummary: { allDishCount: 1, removedDishCount: 0, safeCandidateCount: 0, recommendationCount: 1, lessThanThreeReason: null }
  }), profile());

  assert(result.recommendations.length === 1, "Identical Pommes evidence must validate locally");
  assert(result.recommendations[0]?.reason === "Passt zu Deiner Vorliebe: Pommes.", "Valid Pommes attribution must replace a false AI reason with the deterministic Pommes reason");
}

{
  const result = await validateMainDishAttributions(baseResponse({
    recommendations: [
      recommendation({ nameOriginal: "Pommes", matchedPreferenceValue: "Pommes" })
    ],
    resultSummary: { allDishCount: 1, removedDishCount: 0, safeCandidateCount: 0, recommendationCount: 1, lessThanThreeReason: null }
  }), profile(["Pommes"], [], [], "en-US"));

  assert(result.recommendations[0]?.reason === "Matches your preference: Pommes.", "en-US deterministic reason must not use German text");
}

{
  const result = await validateMainDishAttributions(baseResponse({
    allDishes: [{ nameOriginal: "Rahm", descriptionOriginal: null, price: null, detectedConflicts: [], isSafe: false }],
    removedDishes: [{ nameOriginal: "Rahm", matchedProfileValue: "Kein Koriander", reason: "Konflikt" }],
    resultSummary: { allDishCount: 1, removedDishCount: 1, safeCandidateCount: 0, recommendationCount: 0, lessThanThreeReason: null }
  }), profile());

  assert(result.removedDishes.length === 0, "Kein Koriander and Rahm must be invalid");
  assert(result.safeCandidates.length === 1, "Invalid Main-AI removal must be restored into the safety candidate path");
}

{
  const result = await validateMainDishAttributions(baseResponse({
    allDishes: [{ nameOriginal: "Koriander Reis", descriptionOriginal: null, price: null, detectedConflicts: [], isSafe: false }],
    removedDishes: [{ nameOriginal: "Koriander Reis", matchedProfileValue: "Kein Koriander", reason: "Konflikt" }],
    resultSummary: { allDishCount: 1, removedDishCount: 1, safeCandidateCount: 0, recommendationCount: 0, lessThanThreeReason: null }
  }), profile());

  assert(result.removedDishes.length === 1, "Kein Koriander must validate against direct visible Koriander evidence");
  assert(result.safeCandidates.length === 0, "Valid direct hard-value attribution must not restore the removed dish");
}

{
  const result = await validateMainDishAttributions(baseResponse({
    allDishes: [{ nameOriginal: "Leber Berliner Art", descriptionOriginal: null, price: null, detectedConflicts: [], isSafe: false }],
    removedDishes: [{ nameOriginal: "Leber Berliner Art", matchedProfileValue: "Keine Leber", reason: "Konflikt" }],
    resultSummary: { allDishCount: 1, removedDishCount: 1, safeCandidateCount: 0, recommendationCount: 0, lessThanThreeReason: null }
  }), profile([], ["Keine Leber"]));

  assert(result.removedDishes.length === 1, "Keine Leber must validate against direct visible Leber evidence");
}

{
  const result = await validateMainDishAttributions(baseResponse({
    recommendations: [
      recommendation({ nameOriginal: "Penne arrabbiata", matchedPreferenceValue: "scharf" }),
      recommendation({ nameOriginal: "Pizza Margherita", matchedPreferenceValue: "Pizza" })
    ],
    resultSummary: { allDishCount: 2, removedDishCount: 0, safeCandidateCount: 0, recommendationCount: 2, lessThanThreeReason: null }
  }), profile(["Pommes"]));

  assert(result.recommendations.length === 2, "Inactive or invented preference values must not remove safety-safe recommendations");
  assert(result.recommendations.every((item) => item.matchedPreferenceValue === null), "Inactive or invented preference values must become neutral");
}

{
  const result = await validateMainDishAttributions(baseResponse({
    recommendations: [
      recommendation({ nameOriginal: "Pasta al pomodoro", matchedPreferenceValue: undefined })
    ],
    resultSummary: { allDishCount: 1, removedDishCount: 0, safeCandidateCount: 0, recommendationCount: 1, lessThanThreeReason: null }
  }), profile(["Pommes"]));

  assert(result.recommendations.length === 1, "Missing preference attribution fields must not remove a safety-safe recommendation");
  assert(result.recommendations[0]?.matchedPreferenceValue === null, "Missing preference attribution fields must become neutral");
}

{
  const result = await validateMainDishAttributions(baseResponse({
    recommendations: [
      recommendation({ nameOriginal: "Pasta al pomodoro", matchedPreferenceValue: undefined, reason: "Freier AI-Reason" })
    ],
    resultSummary: { allDishCount: 1, removedDishCount: 0, safeCandidateCount: 0, recommendationCount: 1, lessThanThreeReason: null }
  }), profile([], [], [], "en-US"));

  assert(result.recommendations.length === 1, "No active preferences must still allow a safety-safe recommendation");
  assert(result.recommendations[0]?.reason === "Selected without a confirmed match to your preferences.", "No active preferences must neutralize free AI reasons");
}

{
  const result = await validateMainDishAttributions(baseResponse({
    recommendations: [
      recommendation({ nameOriginal: "patatine fritte", matchedPreferenceValue: "Pommes" })
    ],
    resultSummary: { allDishCount: 1, removedDishCount: 0, safeCandidateCount: 0, recommendationCount: 1, lessThanThreeReason: null }
  }), profile());

  assert(result.recommendations.length === 1, "Pommes and patatine fritte must be valid via Evidence AI");
}

{
  const capturedChecks = [];
  const { validateMainDishAttributions: validateWithCapturedChecks } = loadAttributionValidatorModule({ verdicts, capturedChecks });
  const result = await validateWithCapturedChecks(baseResponse({
    safeCandidates: [
      safeCandidateWithPayload({
        nameOriginal: "Говядина на гриле",
        descriptionOriginal: "подается с картофелем",
        payloadNameOriginal: "",
        payloadDescriptionOriginal: "",
        matchedPreferenceValue: "Rindfleisch"
      })
    ],
    resultSummary: { allDishCount: 1, removedDishCount: 0, safeCandidateCount: 1, recommendationCount: 0, lessThanThreeReason: null }
  }), profile(["Rindfleisch"]));

  assert(result.safeCandidates[0]?.recommendationPayload, "Valid Russian beef candidate payload must remain available");
  assert(capturedChecks.some((check) => check.nameOriginal === "Говядина на гриле" && check.descriptionOriginal === "подается с картофелем"), "Empty payload fields must not override canonical Russian candidate source text");
}

{
  const result = await validateMainDishAttributions(baseResponse({
    safeCandidates: [
      safeCandidateWithPayload({
        nameOriginal: "Курица с овощами",
        payloadNameOriginal: "",
        matchedPreferenceValue: "Huhn"
      })
    ],
    resultSummary: { allDishCount: 1, removedDishCount: 0, safeCandidateCount: 1, recommendationCount: 0, lessThanThreeReason: null }
  }), profile(["Huhn"]));

  assert(result.safeCandidates[0]?.recommendationPayload, "Russian chicken evidence must validate Huhn");
}

{
  const result = await validateMainDishAttributions(baseResponse({
    safeCandidates: [
      safeCandidateWithPayload({
        nameOriginal: "Утинка с картофелем",
        payloadNameOriginal: "",
        matchedPreferenceValue: "Huhn"
      })
    ],
    resultSummary: { allDishCount: 1, removedDishCount: 0, safeCandidateCount: 1, recommendationCount: 0, lessThanThreeReason: null }
  }), profile(["Huhn"]));

  assert(result.safeCandidates[0]?.recommendationPayload, "Invalid Russian duck preference evidence must keep the safe candidate payload for neutral backfill");
  assert(result.safeCandidates[0]?.recommendationPayload?.matchedPreferenceValue === null, "Invalid Russian duck preference evidence must clear the personal preference value");
  assert(result.attributionNotConfirmed === false, "Invalid Russian duck preference evidence must not mark the full run");
}

{
  const capturedChecks = [];
  const { validateMainDishAttributions: validateWithCapturedChecks } = loadAttributionValidatorModule({ verdicts, capturedChecks });
  await validateWithCapturedChecks(baseResponse({
    allDishes: [{ nameOriginal: "Говядина на гриле", descriptionOriginal: "видимая каноническая строка", price: null, detectedConflicts: [], isSafe: true }],
    safeCandidates: [
      safeCandidateWithPayload({
        nameOriginal: "Говядина на гриле",
        descriptionOriginal: "",
        payloadNameOriginal: "",
        payloadDescriptionOriginal: "   ",
        matchedPreferenceValue: "Rindfleisch"
      })
    ],
    resultSummary: { allDishCount: 1, removedDishCount: 0, safeCandidateCount: 1, recommendationCount: 0, lessThanThreeReason: null }
  }), profile(["Rindfleisch"]));

  assert(capturedChecks.some((check) => check.nameOriginal === "Говядина на гриле" && check.descriptionOriginal === "видимая каноническая строка"), "Blank candidate/payload descriptions must fall back to allDishes canonical description");
}

{
  const capturedChecks = [];
  const { validateMainDishAttributions: validateWithCapturedChecks } = loadAttributionValidatorModule({ verdicts, capturedChecks });
  const result = await validateWithCapturedChecks(baseResponse({
    allDishes: [{ nameOriginal: "Говядина тушеная", descriptionOriginal: "каноническое описание", price: null, detectedConflicts: [], isSafe: true }],
    safeCandidates: [
      safeCandidateWithPayload({
        nameOriginal: "Говядина тушеная",
        descriptionOriginal: "",
        matchedPreferenceValue: "Rindfleisch"
      })
    ],
    recommendations: [
      recommendation({ nameOriginal: "Говядина тушеная", descriptionOriginal: "", matchedPreferenceValue: "Rindfleisch" })
    ],
    resultSummary: { allDishCount: 1, removedDishCount: 0, safeCandidateCount: 1, recommendationCount: 1, lessThanThreeReason: null }
  }), profile(["Rindfleisch"]));

  assert(result.recommendations.length === 1, "Recommendation must validate against canonical SafeCandidate/allDishes source text");
  assert(capturedChecks.some((check) => check.nameOriginal === "Говядина тушеная" && check.descriptionOriginal === "каноническое описание"), "Recommendation Evidence input must use canonical source text when a matching candidate/allDishes entry exists");
}

{
  const result = await validateMainDishAttributions(baseResponse({
    recommendations: [
      recommendation({ nameOriginal: "Halluzinierter Beleg", matchedPreferenceValue: "Rindfleisch" })
    ],
    resultSummary: { allDishCount: 1, removedDishCount: 0, safeCandidateCount: 0, recommendationCount: 1, lessThanThreeReason: null }
  }), profile());

  assert(result.recommendations.length === 1, "A valid Evidence AI verdict with non-visible evidence must become a neutral recommendation");
  assert(result.recommendations[0]?.matchedPreferenceValue === null, "Non-visible Evidence must not keep a personal preference value");
}

{
  const result = await validateMainDishAttributions(baseResponse({
    recommendations: [
      recommendation({ nameOriginal: "Fehlender Beleg", matchedPreferenceValue: "Rindfleisch" })
    ],
    resultSummary: { allDishCount: 1, removedDishCount: 0, safeCandidateCount: 0, recommendationCount: 1, lessThanThreeReason: null }
  }), profile());

  assert(result.recommendations.length === 1, "A valid Evidence AI verdict without evidence must become a neutral recommendation");
  assert(result.recommendations[0]?.matchedPreferenceValue === null, "Missing Evidence must not keep a personal preference value");
}

{
  const result = await validateMainDishAttributions(baseResponse({
    recommendations: [
      recommendation({ nameOriginal: "Lachsforellenfilet", matchedPreferenceValue: "Rindfleisch" })
    ],
    safeCandidates: [
      safeCandidateWithPayload({ nameOriginal: "Entrecote di manzo danese", matchedPreferenceValue: "Rindfleisch" }),
      safeCandidateWithPayload({ nameOriginal: "Pommes", matchedPreferenceValue: "Pommes" })
    ],
    resultSummary: { allDishCount: 3, removedDishCount: 0, safeCandidateCount: 2, recommendationCount: 1, lessThanThreeReason: null }
  }), profile());

  assert(result.recommendations.length === 1, "Invalid preference recommendations must remain available as neutral safety-safe recommendations");
  assert(result.recommendations[0]?.matchedPreferenceValue === null, "Invalid preference recommendations must not keep a personal preference value");
  assert(result.safeCandidates.every((candidate) => candidate.recommendationPayload), "Valid safe candidate payloads must remain available for backfill");
}

{
  const { validateMainDishAttributions: validateWithTimeout } = loadAttributionValidatorModule({ throwOnVerify: true });
  const result = await validateWithTimeout(baseResponse({
    recommendations: [
      recommendation({ nameOriginal: "Entrecote di manzo danese", matchedPreferenceValue: "Rindfleisch" }),
      recommendation({ nameOriginal: "patatine fritte", matchedPreferenceValue: "Pommes" })
    ],
    resultSummary: { allDishCount: 2, removedDishCount: 0, safeCandidateCount: 0, recommendationCount: 2, lessThanThreeReason: null }
  }), profile());

  assert(result.recommendations.length === 2, "Evidence timeout must not abort preference-safe recommendations");
  assert(result.recommendations.every((item) => item.matchedPreferenceValue === null), "Evidence timeout must neutralize preference attribution");
  assert(result.recommendations.every((item) => item.reason === "Ausgewählt ohne bestätigten Bezug zu Deinen Vorlieben."), "Evidence timeout must use neutral reasons");
  assert(result.attributionNotConfirmed === false, "Evidence timeout must not produce an attribution-not-confirmed run");
}

{
  const checks = [
    { attributionId: "attr_0", profileType: "preference", profileValue: "Rindfleisch", nameOriginal: "Entrecote di manzo danese", descriptionOriginal: null },
    { attributionId: "attr_1", profileType: "preference", profileValue: "Pommes", nameOriginal: "patatine fritte", descriptionOriginal: null }
  ];

  assert(validateAttributionEvidenceResponse(checks, { checks: [{ attributionId: "attr_0", verdict: "valid", profileEvidence: "manzo", evidenceSource: "name" }] })[1]?.verdict === "uncertain", "Missing attribution ID must be uncertain");
  assert(validateAttributionEvidenceResponse(checks, { checks: [{ attributionId: "attr_0", verdict: "valid", profileEvidence: "manzo", evidenceSource: "name" }, { attributionId: "attr_0", verdict: "invalid", profileEvidence: null, evidenceSource: null }] })[0]?.verdict === "uncertain", "Duplicate attribution ID must be uncertain");
  assert(validateAttributionEvidenceResponse(checks, { checks: [{ attributionId: "unknown", verdict: "valid", profileEvidence: "manzo", evidenceSource: "name" }, { attributionId: "attr_1", verdict: "valid", profileEvidence: "patatine fritte", evidenceSource: "name" }] })[0]?.verdict === "uncertain", "Unknown attribution ID must not satisfy expected checks");
  assert(validateAttributionEvidenceResponse(checks, { checks: [{ attributionId: "attr_0", verdict: "maybe", profileEvidence: "manzo", evidenceSource: "name" }] })[0]?.verdict === "uncertain", "Invalid verdict must be uncertain");
  assert(validateAttributionEvidenceResponse(checks, { checks: [{ attributionId: "attr_0", verdict: "valid", profileEvidence: "manzo", evidenceSource: "description" }] })[0]?.verdict === "uncertain", "Evidence in the wrong source field must be uncertain");
  assert(validateAttributionEvidenceResponse(checks, { checks: [{ attributionId: "attr_0", verdict: "valid", profileEvidence: null, evidenceSource: null }] })[0]?.verdict === "uncertain", "Missing evidence in a valid response must be uncertain");
  assert(validateAttributionEvidenceResponse(checks, { checks: [{ attributionId: "attr_0", verdict: "valid", profileEvidence: "Lachs", evidenceSource: "name" }] })[0]?.verdict === "uncertain", "Invented non-visible evidence must be uncertain");
}

{
  const source = fs.readFileSync(path.resolve("apps/api/src/recommendation/attributionValidator.ts"), "utf8");
  const promptSource = fs.readFileSync(path.resolve("apps/api/src/ai/recommendMainDishesAI.ts"), "utf8");

  assert(!source.includes("ATTRIBUTION_ALIASES"), "Manual attribution alias list must be removed");
  assert(source.includes("verifyAttributionEvidenceAI"), "Attribution validator must use the batched Evidence AI verifier");
  assert(!promptSource.includes("profileEvidence und evidenceSource liefern"), "Main AI prompt must not require profileEvidence/evidenceSource");
}

console.log("attribution-validator-regression: ok");
