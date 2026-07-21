import fs from "node:fs";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function count(value, needle) {
  return value.split(needle).length - 1;
}

const mainAi = fs.readFileSync("apps/api/src/ai/recommendMainDishesAI.ts", "utf8");
const schemas = fs.readFileSync("apps/api/src/ai/twoStepRecommendationSchemas.ts", "utf8");
const route = fs.readFileSync("apps/api/app/api/analyze-menu/route.ts", "utf8");

assert(mainAi.includes("const MAIN_DISH_DEFAULT_CANDIDATE_LIMIT = 10;"), "10-candidate case must keep the central default limit");
assert(mainAi.includes("const MAIN_DISH_HARD_RESTRICTION_CANDIDATE_LIMIT = 15;"), "15-candidate case must keep the central hard-restriction limit");
assert(mainAi.includes("const candidateLimit = getMainDishCandidateLimit(profile);"), "prompt must use the central candidateLimit value");
assert(count(mainAi, "function getMainDishCandidateLimit(") === 1, "there must be no second independent candidate-limit calculation");

assert(
  mainAi.includes("`- Das berechnete Kandidatenlimit betraegt ${candidateLimit}; dieser Wert ist die Zielmenge fuer den Kandidatenpool.`"),
  "prompt must describe candidateLimit as the target amount"
);
assert(
  mainAi.includes("`- Wenn auf der gesamten Speisekarte mindestens ${candidateLimit} geeignete Gerichte im Rollenraum ${roleAssignment.label} vorhanden sind, liefere genau ${candidateLimit} unterschiedliche Kandidaten.`"),
  "prompt must require exactly candidateLimit when enough suitable dishes exist"
);
assert(
  mainAi.includes("`- Liefere weniger als ${candidateLimit} Kandidaten nur, wenn nach vollstaendiger Pruefung aller Seiten und aller relevanten Speisekartenbereiche tatsaechlich weniger geeignete Gerichte vorhanden sind.`") &&
    mainAi.includes("- Eine kurze Antwort ist unzulaessig, solange weitere geeignete Gerichte aus dem angeforderten Rollenraum vorhanden sind."),
  "prompt must allow fewer candidates only after complete proof of a smaller suitable set"
);
assert(
  mainAi.includes("Pruefe alle Seiten, alle relevanten Speisekartenbereiche und alle im Analysemodus zulaessigen Gerichte") &&
    mainAi.includes("Setze die Suche fort, bis ${candidateLimit} geeignete Kandidaten erreicht sind oder sicher keine weiteren geeigneten Gerichte vorhanden sind"),
  "prompt must require complete menu coverage before output"
);
assert(
  mainAi.includes("Beende die Auswahl nicht nach zwei, drei oder wenigen Kandidaten") &&
    mainAi.includes("Gib nicht nur die ersten Treffer, den ersten Speisekartenabschnitt oder nur die offensichtlichsten Gerichte zurueck") &&
    mainAi.includes("Gib nicht nur Kandidaten mit starkem Preference-Match zurueck"),
  "prompt must forbid early stopping and narrow obvious-only output"
);
assert(
  mainAi.includes("Vorlieben sind ausschliesslich weiche Ranking-Signale") &&
    mainAi.includes("fehlender Vorliebenbezug macht ein sonst geeignetes Gericht nicht unzulaessig") &&
    mainAi.includes("fuelle den Kandidatenpool bis zur Zielmenge ${candidateLimit} mit anderen geeigneten Kandidaten ohne Preference-Match auf"),
  "prompt must keep preferences soft and allow unmatched suitable candidates to fill the target"
);
assert(
  mainAi.includes("Schliesse Gerichte mit klar erkennbarem Konflikt zu aktiven harten Einschraenkungen aus") &&
    mainAi.includes("Reduziere die Kandidatenzahl nicht vorsorglich wegen blosser Zutatenunsicherheit") &&
    mainAi.includes("die nachgelagerte Safety-Pruefung bewertet unklare Faelle abschliessend"),
  "prompt must preserve clear hard exclusions without pre-solving uncertain Safety"
);
assert(
  mainAi.includes("Fuell die Liste niemals kuenstlich mit erfundenen, ungeeigneten, rollenfremden oder im Analysemodus unzulaessigen Gerichten auf") &&
    mainAi.includes("Erfinde keine Zutaten") &&
    mainAi.includes("Gib keine Duplikate"),
  "prompt must forbid artificial fill-up, invented dishes, and duplicates"
);
assert(
  mainAi.includes("Interne Vollstaendigkeitspruefung vor der Ausgabe") &&
    mainAi.includes("liefere bei mindestens ${candidateLimit} geeigneten Gerichten genau ${candidateLimit}") &&
    mainAi.includes("sonst alle tatsaechlich geeigneten"),
  "prompt must require internal completeness checking without exposing chain-of-thought"
);

assert(schemas.includes('.max(15, "Main AI compact response must not contain more than 15 dishes")'), "schema must remain the Stage-1 15-cap schema");
assert(schemas.includes("recommendations: z.array(MainDishAIRecommendationSchema).max(3)"), "final recommendation cap must remain 3");
assert(mainAi.includes("Antwort ausschliesslich als valides JSON ohne Markdown:"), "output contract must remain JSON-only");
assert(!mainAi.includes('"targetCandidateCount"') && !mainAi.includes('"candidateCountReason"'), "prompt must not add response fields");
assert(count(mainAi, "client.responses.create(request") === 1, "target prompt must not add Main-AI calls");
assert(count(mainAi, "verifyRecommendationSafetyAI({") === 1, "target prompt must not add Safety-AI calls");
assert(route.includes("function buildUncertainReviewResponse({"), "Review path must remain present in route");
assert(!route.includes("main-ai-candidate-target"), "target prompt test must not require route changes");

console.log("main-ai-candidate-target-regression: passed");
