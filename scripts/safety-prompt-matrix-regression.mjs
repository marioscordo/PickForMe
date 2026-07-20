import fs from "node:fs";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const promptFile = fs.readFileSync("apps/api/src/ai/verifyRecommendationSafetyAI.ts", "utf8");
const mainAiFile = fs.readFileSync("apps/api/src/ai/recommendMainDishesAI.ts", "utf8");

function includesAll(text, fragments) {
  return fragments.every((fragment) => text.includes(fragment));
}

assert(
  promptFile.includes("Matrix-Regel: Fuer jede Candidate-Restriction-Kombination muss genau ein eigener Check zurueckgegeben werden."),
  "Safety prompt must require one check for every candidate-restriction combination"
);
assert(
  promptFile.includes("expectedCheckCount = candidates.length * restrictions.length."),
  "Safety prompt must include the expected check count formula"
);
assert(
  promptFile.includes("Die Gesamtzahl aller Checks muss exakt expectedCheckCount entsprechen."),
  "Safety prompt must require the exact computed total check count"
);
assert(
  promptFile.includes("Ein Gesamturteil pro Kandidat ist nicht zulaessig."),
  "Safety prompt must forbid one aggregate verdict per candidate"
);
assert(
  promptFile.includes("Fasse niemals mehrere Restrictions in einem Check zusammen."),
  "Safety prompt must forbid combining multiple restrictions in one check"
);
assert(
  includesAll(promptFile, [
    "Lasse keine Restriction weg",
    "ohne eindeutige Evidenz",
    "gib trotzdem einen Check fuer diese Kombination zurueck",
    "insbesondere uncertain"
  ]),
  "Safety prompt must require a check even when evidence is missing"
);
assert(
  includesAll(promptFile, [
    "keine fehlenden, zusaetzlichen oder doppelten Kombinationen",
    "Jeder Check darf sich nur auf genau eine candidateId und genau eine restrictionId beziehen"
  ]),
  "Safety prompt must require each matrix combination exactly once"
);
assert(
  includesAll(promptFile, [
    "Kandidaten zaehlen",
    "Restrictions zaehlen",
    "expectedCheckCount berechnen",
    "tatsaechliche Checkzahl pruefen",
    "Gib diese Selbstpruefung nicht aus"
  ]),
  "Safety prompt must require internal completeness checking without outputting it"
);

const candidateIds = Array.from(promptFile.matchAll(/"candidateId": "(candidate_[01])"/g), (match) => match[1]);
assert(
  candidateIds.filter((id) => id === "candidate_0").length === 1 &&
    candidateIds.filter((id) => id === "candidate_1").length === 1,
  "Safety prompt example must contain exactly two neutral candidate IDs"
);

const examplePairs = Array.from(
  promptFile.matchAll(/"candidateId": "(candidate_[01])"[\s\S]*?"checks": \[([\s\S]*?)\]/g),
  (match) => ({
    candidateId: match[1],
    checks: Array.from(match[2].matchAll(/"restrictionId": "(restriction_[012])"/g), (checkMatch) => checkMatch[1])
  })
);
assert(examplePairs.length === 2, "Safety prompt example must contain two candidate result objects");

const seenPairs = new Set();
for (const { candidateId, checks } of examplePairs) {
  assert(checks.length === 3, `${candidateId} must contain exactly three checks`);
  for (const restrictionId of checks) {
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
  "Safety prompt example must contain every 2x3 matrix combination exactly once"
);
assert(
  !/"restrictionId": "(?!restriction_[012])/.test(promptFile),
  "Safety prompt example must use only neutral restriction IDs"
);
assert(
  promptFile.includes('"verdict": "safe | conflict | uncertain"') &&
    !promptFile.includes("no_visible_conflict"),
  "Safety prompt must preserve the existing verdict values"
);
assert(
  includesAll(promptFile, [
    '"candidates": [',
    '"candidateId": "candidate_0"',
    '"checks": [',
    '"restrictionId": "restriction_0"',
    '"evidence"',
    '"source"'
  ]),
  "Safety prompt must preserve the existing nested JSON output structure"
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
