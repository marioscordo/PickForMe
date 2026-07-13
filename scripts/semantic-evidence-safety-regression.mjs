import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

function loadSemanticEvidenceModule() {
  const sourcePath = path.resolve("apps/api/src/recommendation/semanticEvidenceSafetyGate.ts");
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

  vm.runInNewContext(compiled, {
    exports: module.exports,
    module,
    require
  }, {
    filename: sourcePath
  });

  return module.exports;
}

const {
  applySemanticEvidenceSafetyGate,
  buildSemanticEvidenceRestrictions,
  rebuildMainDishRecommendationsFromSemanticSafeCandidates
} = loadSemanticEvidenceModule();

const restrictions = buildSemanticEvidenceRestrictions({
  allergens: ["Walnuesse", "Muscheln"],
  customExclusions: ["Sahne", "Schweinefleisch"]
});

const byLabel = new Map(restrictions.map((restriction) => [restriction.label, restriction.id]));

function candidate(nameOriginal, descriptionOriginal, match) {
  const profileSafety = {
    hasKnownConflict: false,
    uncertainForAllergy: false,
    conflictReason: null
  };

  return {
    nameOriginal,
    descriptionOriginal,
    scoreReason: `Score ${nameOriginal}`,
    translatedName: `DE ${nameOriginal}`,
    confidence: "medium",
    profileSafety,
    recommendationPayload: {
      nameOriginal,
      translatedName: `DE ${nameOriginal}`,
      descriptionOriginal,
      translatedDescription: `Beschreibung ${nameOriginal}`,
      priceRaw: `${nameOriginal.length},00 EUR`,
      sourceEvidence: descriptionOriginal,
      sourceKind: "pdf",
      sourceUrl: "https://test.invalid/menu.pdf",
      sourceCategoryOriginal: "Mains",
      reason: `Reason ${nameOriginal}`,
      confidence: "medium",
      profileSafety
    },
    safetyMatches: match ? [match] : undefined
  };
}

function withoutRecommendationPayload(item) {
  const { recommendationPayload, ...rest } = item;
  return rest;
}

function match(label, evidence, relation = "contains", source = "description") {
  return {
    restrictionId: byLabel.get(label),
    evidence,
    source,
    relation
  };
}

function gate(candidates) {
  return applySemanticEvidenceSafetyGate({
    candidates,
    restrictions
  });
}

{
  const result = gate([
    candidate("Veggie Mousaka", "with a walnut & mushroom ragu", match("Walnuesse", "walnut"))
  ]);

  assert(result.candidates.length === 0, "Mira walnut candidate must be removed");
  assert(result.removed[0]?.nameOriginal === "Veggie Mousaka", "Mira removed candidate name missing");
}

for (const [label, evidence, description] of [
  ["Walnuesse", "walnuts", "beetroot, walnuts, dried figs"],
  ["Sahne", "cream sauce", "pasta with cream sauce"],
  ["Schweinefleisch", "pork", "slow cooked pork shoulder"],
  ["Muscheln", "mussels", "fresh steamed mussels"],
  ["Walnuesse", "καρύδια", "με αποξηραμένο σύκο, πορτοκάλι, καρύδια, μήλο"]
]) {
  const result = gate([candidate(`Candidate ${evidence}`, description, match(label, evidence))]);

  assert(result.candidates.length === 0, `Expected visible evidence to block ${label} / ${evidence}`);
}

for (const [description, safetyMatch, expectedMessage] of [
  ["plain tomato pasta", match("Walnuesse", "walnut"), "Hallucinated evidence must be ignored"],
  ["with walnut", { ...match("Walnuesse", "walnut"), restrictionId: "unknown_0" }, "Unknown restriction ID must be ignored"],
  ["without walnuts", match("Walnuesse", "walnuts", "free_from"), "free_from must not block"],
  ["unclear walnut reference", match("Walnuesse", "walnut", "unknown"), "unknown relation must not block"],
  ["traditional pesto", undefined, "Missing safetyMatches must not block"],
  ["traditional pesto", { restrictionId: byLabel.get("Walnuesse"), evidence: "", source: "description", relation: "contains" }, "Incomplete match must not block"],
  ["traditional pesto", match("Walnuesse", "walnut"), "Traditional pesto without visible nut evidence must not block"],
  ["without walnuts", match("Walnuesse", "walnuts", "free_from"), "without walnuts with free_from must not block"]
]) {
  const result = gate([candidate(expectedMessage, description, safetyMatch)]);

  assert(result.candidates.length === 1, expectedMessage);
}

{
  const result = gate([{ ...candidate("Empty matches", "traditional pesto"), safetyMatches: [] }]);

  assert(result.candidates.length === 1, "Empty safetyMatches array must not block");
}

{
  const candidates = [
    candidate("A", "safe A"),
    candidate("B", "walnut sauce", match("Walnuesse", "walnut")),
    candidate("C", "safe C"),
    candidate("D", "safe D")
  ];
  const gated = gate(candidates);
  const recommendations = rebuildMainDishRecommendationsFromSemanticSafeCandidates({
    safeCandidates: gated.candidates
  });

  assert(recommendations.map((item) => item.nameOriginal).join(",") === "A,C,D", "Fourth candidate must move up without reranking");
  assert(recommendations[2]?.reason === "Reason D", "Moved-up candidate must keep its own reason");
  assert(recommendations[2]?.sourceEvidence === "safe D", "Moved-up candidate must keep its own evidence");
  assert(recommendations[2]?.translatedName === "DE D", "Moved-up candidate must keep its own translation");
}

{
  const gated = gate([
    candidate("A", "safe A"),
    candidate("B", "safe B"),
    candidate("C", "walnut sauce", match("Walnuesse", "walnut"))
  ]);
  const recommendations = rebuildMainDishRecommendationsFromSemanticSafeCandidates({
    safeCandidates: gated.candidates
  });

  assert(recommendations.length === 2, "Exactly two recommendations expected when two candidates remain");
}

{
  const gated = gate([
    candidate("A", "walnut sauce", match("Walnuesse", "walnut"))
  ]);
  const recommendations = rebuildMainDishRecommendationsFromSemanticSafeCandidates({
    safeCandidates: gated.candidates
  });

  assert(gated.candidates.length === 0, "No safe candidate should remain");
  assert(recommendations.length === 0, "No recommendation expected when no safe candidate remains");
}

{
  const gated = gate([
    candidate("A", "safe A"),
    candidate("B", "safe B"),
    candidate("C", "safe C")
  ]);

  assert(gated.candidates.map((item) => item.nameOriginal).join(",") === "A,B,C", "Candidate order must remain unchanged");
}

{
  const candidates = [
    candidate("A", "safe A"),
    candidate("Veggie Mousaka", "walnut & mushroom ragu", match("Walnuesse", "walnut")),
    candidate("C", "safe C"),
    candidate("D", "safe D")
  ];
  const gated = gate(candidates);
  const recommendations = rebuildMainDishRecommendationsFromSemanticSafeCandidates({
    safeCandidates: gated.candidates
  });

  assert(gated.removed[0]?.nameOriginal === "Veggie Mousaka", "Mira moved-up case must remove Veggie Mousaka");
  assert(recommendations.map((item) => item.nameOriginal).join(",") === "A,C,D", "Mira moved-up case must return A,C,D");
  assert(recommendations[2]?.reason === "Reason D", "Mira moved-up D must use D reason");
}

{
  const candidates = [
    candidate("A", "safe A"),
    withoutRecommendationPayload(candidate("B", "safe B")),
    candidate("C", "safe C"),
    candidate("D", "safe D")
  ];
  const recommendations = rebuildMainDishRecommendationsFromSemanticSafeCandidates({
    safeCandidates: candidates
  });

  assert(recommendations.map((item) => item.nameOriginal).join(",") === "A,C,D", "Candidate without payload must be skipped");
}

{
  const incomplete = candidate("B", "safe B");
  incomplete.recommendationPayload = {
    ...incomplete.recommendationPayload,
    translatedName: undefined
  };
  const recommendations = rebuildMainDishRecommendationsFromSemanticSafeCandidates({
    safeCandidates: [candidate("A", "safe A"), incomplete, candidate("C", "safe C")]
  });

  assert(recommendations.map((item) => item.nameOriginal).join(",") === "A,C", "Candidate without translatedName must be skipped");
}

{
  const candidates = [
    { ...candidate("House Salad", "walnuts", match("Walnuesse", "walnuts")), recommendationPayload: { ...candidate("House Salad", "walnuts").recommendationPayload, reason: "Reason walnut salad" } },
    { ...candidate("House Salad", "tomatoes"), recommendationPayload: { ...candidate("House Salad", "tomatoes").recommendationPayload, reason: "Reason tomato salad" } },
    candidate("D", "safe D")
  ];
  const gated = gate(candidates);
  const recommendations = rebuildMainDishRecommendationsFromSemanticSafeCandidates({
    safeCandidates: gated.candidates
  });

  assert(gated.candidates.length === 2, "Only conflicting duplicate-name candidate must be removed");
  assert(recommendations[0]?.reason === "Reason tomato salad", "Duplicate-name survivor must keep its own payload");
}

{
  const candidates = [
    candidate("Moussaka", "walnut ragu", match("Walnuesse", "walnut")),
    candidate("Moussaka", "eggplant and tomato"),
    candidate("Classic Mousaka", "safe classic")
  ];
  const gated = gate(candidates);
  const recommendations = rebuildMainDishRecommendationsFromSemanticSafeCandidates({
    safeCandidates: gated.candidates
  });

  assert(recommendations.map((item) => item.descriptionOriginal).join("|") === "eggplant and tomato|safe classic", "Same-name and similar-name candidates must not mix descriptions");
}

{
  const recommendations = rebuildMainDishRecommendationsFromSemanticSafeCandidates({
    safeCandidates: [candidate("A", "safe A"), candidate("B", "safe B"), candidate("C", "safe C")]
  });

  assert(recommendations.length === 3, "Three complete candidates must yield three recommendations");
}

{
  const recommendations = rebuildMainDishRecommendationsFromSemanticSafeCandidates({
    safeCandidates: [candidate("A", "safe A")]
  });

  assert(recommendations.length === 1, "One complete candidate must yield one recommendation");
}

console.log("semantic-evidence-safety-regression: ok");
