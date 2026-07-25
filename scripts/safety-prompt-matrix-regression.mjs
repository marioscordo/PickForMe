import fs from "node:fs";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const promptFile = fs.readFileSync("apps/api/src/ai/verifyRecommendationSafetyAI.ts", "utf8").replace(/\r\n/g, "\n");
const mainAiFile = fs.readFileSync("apps/api/src/ai/recommendMainDishesAI.ts", "utf8").replace(/\r\n/g, "\n");

function includesAll(text, fragments) {
  return fragments.every((fragment) => text.includes(fragment));
}

assert(
  promptFile.includes("Liefere fuer jeden Kandidaten genau ein Paket-Ergebnis."),
  "Safety prompt must require exactly one package result per candidate"
);
assert(
  promptFile.includes("Pruefe jeden Kandidaten gegen das komplette Restriktionspaket."),
  "Safety prompt must require every candidate to be checked against the complete restriction package"
);
assert(
  promptFile.includes("Jede Restriction-ID muss pro Kandidat in checkedRestrictionIds enthalten sein."),
  "Safety prompt must require all restriction IDs in checkedRestrictionIds"
);
assert(
  promptFile.includes("matchedRestrictions enthaelt nur Restrictions mit conflict oder uncertain."),
  "Safety prompt must keep safe restrictions out of matchedRestrictions"
);
assert(
  promptFile.includes("Wenn fuer keine Restriction ein Konflikt oder eine Unsicherheit besteht, ist overallVerdict safe und matchedRestrictions ist leer."),
  "Safety prompt must define the safe package shape"
);
assert(
  includesAll(promptFile, [
    "Lasse keine Restriction weg",
    "ohne eindeutige Evidenz",
    "Pruefe nicht nur die erste, wichtigste oder wahrscheinlichste Restriction"
  ]),
  "Safety prompt must require complete restriction coverage even when evidence is missing"
);
assert(
  includesAll(promptFile, [
    "Kandidaten zaehlen",
    "Restrictions zaehlen",
    "sicherstellen, dass jeder Kandidat alle Restriction-IDs in checkedRestrictionIds enthaelt"
  ]),
  "Safety prompt must require internal package completeness checking without outputting it"
);

const candidateIds = Array.from(promptFile.matchAll(/"candidateId": "(candidate_[01])"/g), (match) => match[1]);
assert(
  candidateIds.filter((id) => id === "candidate_0").length === 1 &&
    candidateIds.filter((id) => id === "candidate_1").length === 1,
  "Safety prompt example must contain exactly two neutral candidate IDs"
);

const examplePairs = Array.from(
  promptFile.matchAll(/"candidateId": "(candidate_[01])"[\s\S]*?"checkedRestrictionIds": \[([\s\S]*?)\][\s\S]*?"matchedRestrictions": \[([\s\S]*?)\]/g),
  (match) => ({
    candidateId: match[1],
    checkedRestrictionIds: Array.from(match[2].matchAll(/"restriction_([012])"/g), (checkMatch) => `restriction_${checkMatch[1]}`),
    matchedRestrictionIds: Array.from(match[3].matchAll(/"restrictionId": "(restriction_[012])"/g), (checkMatch) => checkMatch[1])
  })
);
assert(examplePairs.length === 2, "Safety prompt example must contain two candidate result objects");

const seenPairs = new Set();
for (const { candidateId, checkedRestrictionIds } of examplePairs) {
  assert(checkedRestrictionIds.length === 3, `${candidateId} must contain exactly three checked restriction IDs`);
  for (const restrictionId of checkedRestrictionIds) {
    seenPairs.add(`${candidateId}:${restrictionId}`);
  }
}

const expectedPairs = [
  "candidate_0:restriction_0",
  "candidate_0:restriction_1",
  "candidate_0:restriction_2",
  "candidate_1:restriction_0",
  "candidate_1:restriction_1",
  "candidate_1:restriction_2"
];
assert(
  expectedPairs.every((pair) => seenPairs.has(pair)) && seenPairs.size === 6,
  "Safety prompt example must contain every 2x3 candidate-package restriction ID exactly once"
);
assert(
  !/"restrictionId": "(?!restriction_[012])/.test(promptFile),
  "Safety prompt example must use only neutral restriction IDs"
);
assert(
  promptFile.includes('"overallVerdict": "safe | conflict | uncertain"') &&
    promptFile.includes('"verdict": "conflict | uncertain"') &&
    !promptFile.includes("no_visible_conflict"),
  "Safety prompt must preserve the existing verdict values"
);
assert(
  includesAll(promptFile, [
    '"candidates": [',
    '"candidateId": "candidate_0"',
    '"overallVerdict": "safe | conflict | uncertain"',
    '"checkedRestrictionIds": ["restriction_0", "restriction_1", "restriction_2"]',
    '"matchedRestrictions": [',
    '"evidence"',
    '"source"'
  ]),
  "Safety prompt must preserve the package JSON output structure"
);

assert(
  (promptFile.match(/client\.responses\.create\(/g) ?? []).length === 1,
  "Safety prompt change must not add Safety-AI calls"
);
assert(
  (mainAiFile.match(/verifyRecommendationSafetyAI\(/g) ?? []).length === 1,
  "Safety prompt change must not add verifier invocations"
);
assert(
  !promptFile.includes("retry") &&
    !promptFile.includes("json_schema") &&
    !promptFile.includes("response_format"),
  "Safety prompt change must not introduce retry or structured-output runtime changes"
);

console.log("safety-prompt-matrix-regression: passed");
