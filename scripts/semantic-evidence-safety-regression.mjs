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

function loadSafetyVerifierModule() {
  const sourcePath = path.resolve("apps/api/src/recommendation/recommendationSafetyVerifier.ts");
  const source = fs.readFileSync(sourcePath, "utf8").replace(/\r\n/g, "\n");
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
  buildRecommendationSafetyRestrictions,
  filterSafeRecommendationCandidates,
  validateRecommendationSafetyResponse
} = loadSafetyVerifierModule();

const restrictions = buildRecommendationSafetyRestrictions({
  allergens: ["Walnuesse"],
  customExclusions: ["Sahne"]
});

function candidate(id, nameOriginal, descriptionOriginal) {
  return {
    id,
    nameOriginal,
    descriptionOriginal
  };
}

function check(restrictionId, verdict, evidence = null, source = null) {
  return {
    restrictionId,
    verdict,
    evidence,
    source
  };
}

function safetyResult(candidateId, overallVerdict, checkedRestrictionIds, matchedRestrictions = []) {
  return {
    candidateId,
    overallVerdict,
    checkedRestrictionIds,
    matchedRestrictions
  };
}

function response(items) {
  return {
    candidates: items
  };
}

function resultFor(candidates, verifierResponse, activeRestrictions = restrictions) {
  return filterSafeRecommendationCandidates({
    restrictions: activeRestrictions,
    candidates,
    response: verifierResponse
  });
}

{
  const candidates = [
    candidate("candidate_0", "Veggie Mousaka", "walnut & mushroom ragu"),
    candidate("candidate_1", "Chicken Fillet", "grilled chicken"),
    candidate("candidate_2", "Seafood Pasta", "tomato sauce"),
    candidate("candidate_3", "Pasta el greco", "tomato and feta")
  ];
  const result = resultFor(candidates, response([
    safetyResult("candidate_0", "conflict", ["allergen_0", "exclusion_0"], [check("allergen_0", "conflict", "walnut", "description")]),
    safetyResult("candidate_1", "safe", ["allergen_0", "exclusion_0"]),
    safetyResult("candidate_2", "safe", ["allergen_0", "exclusion_0"]),
    safetyResult("candidate_3", "safe", ["allergen_0", "exclusion_0"])
  ]));

  assert(result.candidates.map((item) => item.nameOriginal).join(",") === "Chicken Fillet,Seafood Pasta,Pasta el greco", "Mira main candidate must be removed and next candidates must move up");
}

{
  const starters = [
    candidate("starter_0", "Beetroot salad", "walnuts")
  ];
  const result = resultFor(starters, response([
    safetyResult("starter_0", "conflict", ["allergen_0", "exclusion_0"], [check("allergen_0", "conflict", "walnuts", "description")])
  ]));

  assert(result.candidates.length === 0, "Mira beetroot salad starter must be removed");
}

for (const [description, evidence] of [
  ["without walnuts", "without walnuts"],
  ["nut-free", "nut-free"],
  ["free from milk", "free from milk"]
]) {
  const candidates = [candidate("candidate_0", "Safe dish", description)];
  const activeRestrictions = buildRecommendationSafetyRestrictions({ allergens: ["Walnuesse"] });
  const result = resultFor(candidates, response([
    safetyResult("candidate_0", "safe", ["allergen_0"])
  ]), activeRestrictions);

  assert(result.candidates.length === 1, `${description} must not block when verifier returns safe`);
}

{
  const candidates = [candidate("candidate_0", "Dessert", "may contain walnuts")];
  const activeRestrictions = buildRecommendationSafetyRestrictions({ allergens: ["Walnuesse"] });
  const result = resultFor(candidates, response([
    safetyResult("candidate_0", "conflict", ["allergen_0"], [check("allergen_0", "conflict", "may contain walnuts", "description")])
  ]), activeRestrictions);

  assert(result.candidates.length === 0, "may contain walnuts must block for allergens");
}

{
  const candidates = [candidate("candidate_0", "Dish", "unclear sauce")];
  const activeRestrictions = buildRecommendationSafetyRestrictions({ allergens: ["Walnuesse"] });
  const result = resultFor(candidates, response([
    safetyResult("candidate_0", "uncertain", ["allergen_0"], [check("allergen_0", "uncertain")])
  ]), activeRestrictions);

  assert(result.candidates.length === 0, "uncertain must fail closed");
}

{
  const candidates = [candidate("candidate_0", "Dish", "plain tomato")];
  const activeRestrictions = buildRecommendationSafetyRestrictions({ allergens: ["Walnuesse"] });
  const result = resultFor(candidates, response([
    safetyResult("candidate_0", "no_visible_conflict", ["allergen_0"])
  ]), activeRestrictions);

  assert(result.candidates.length === 0, "unsupported verifier verdicts must fail closed");
}

{
  const candidates = [candidate("candidate_0", "Dish", "plain tomato")];
  const result = resultFor(candidates, response([
    safetyResult("candidate_0", "safe", ["allergen_0"])
  ]));

  assert(result.candidates.length === 0, "missing restriction check must fail closed");
}

{
  const candidates = [candidate("candidate_0", "Dish", "plain tomato")];
  const result = resultFor(candidates, response([
    safetyResult("candidate_0", "safe", ["allergen_0", "allergen_0"])
  ]));

  assert(result.candidates.length === 0, "duplicate restriction ID must fail closed");
}

{
  const candidates = [candidate("candidate_0", "Dish", "plain tomato")];
  const validation = validateRecommendationSafetyResponse({
    restrictions,
    candidates,
    response: response([
      safetyResult("unknown_candidate", "safe", ["allergen_0", "exclusion_0"])
    ])
  });

  assert(validation[0]?.safe === false, "unknown candidate ID must not mark a real candidate safe");
}

{
  const candidates = [candidate("candidate_0", "Dish", "plain tomato")];
  const result = resultFor(candidates, response([
    safetyResult("candidate_0", "safe", ["allergen_0", "exclusion_0"]),
    safetyResult("candidate_0", "safe", ["allergen_0", "exclusion_0"])
  ]));

  assert(result.candidates.length === 0, "duplicate candidate ID must fail closed");
}

{
  const candidates = [candidate("candidate_0", "Dish", "plain tomato")];
  const result = resultFor(candidates, response([
    safetyResult("candidate_0", "conflict", ["allergen_0", "exclusion_0"], [check("allergen_0", "conflict", "walnut", "description")])
  ]));

  assert(result.candidates.length === 0, "hallucinated evidence must fail closed");
}

{
  const candidates = [
    candidate("candidate_0", "House Salad", "walnuts"),
    candidate("candidate_1", "House Salad", "tomatoes")
  ];
  const activeRestrictions = buildRecommendationSafetyRestrictions({ allergens: ["Walnuesse"] });
  const result = resultFor(candidates, response([
    safetyResult("candidate_0", "conflict", ["allergen_0"], [check("allergen_0", "conflict", "walnuts", "description")]),
    safetyResult("candidate_1", "safe", ["allergen_0"])
  ]), activeRestrictions);

  assert(result.candidates.map((item) => item.id).join(",") === "candidate_1", "duplicate names must be separated by candidate ID");
}

{
  const candidates = [
    candidate("candidate_0", "A", "safe A"),
    candidate("candidate_1", "B", "walnut sauce"),
    candidate("candidate_2", "C", "safe C"),
    candidate("candidate_3", "D", "safe D")
  ];
  const activeRestrictions = buildRecommendationSafetyRestrictions({ allergens: ["Walnuesse"] });
  const result = resultFor(candidates, response([
    safetyResult("candidate_0", "safe", ["allergen_0"]),
    safetyResult("candidate_1", "conflict", ["allergen_0"], [check("allergen_0", "conflict", "walnut", "description")]),
    safetyResult("candidate_2", "safe", ["allergen_0"]),
    safetyResult("candidate_3", "safe", ["allergen_0"])
  ]), activeRestrictions);

  assert(result.candidates.map((item) => item.nameOriginal).join(",") === "A,C,D", "four-to-three order must remain stable");
}

{
  const candidates = [candidate("candidate_0", "A", "safe A")];
  const result = resultFor(candidates, response([]), []);

  assert(result.candidates.length === 1, "no restrictions must keep candidates without verifier checks");
}

console.log("recommendation-safety-verifier-regression: ok");
