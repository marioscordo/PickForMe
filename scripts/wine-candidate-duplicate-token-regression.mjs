import fs from "node:fs";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

// Token-Optimierung Juli 2026: wineCandidates wurde bisher ZWEIMAL an die
// KI gesendet - einmal ueber source.text in wine-menu-recommendation/route.ts
// ("Vorstrukturierte WineCandidates:") und ein zweites Mal ueber
// buildConcreteWinePrompt() in recommendConcreteWineForMainDishAI.ts
// ("WineCandidates als einzige Quelle fuer konkrete Weine:"), die dann via
// buildTwoStepSourceContent() zusammengefuehrt werden. Bei einer vollen
// Weinkarte (~60 Kandidaten) waren das ca. 5.500 reine Duplikat-Tokens ohne
// zusaetzlichen Informationsgewinn.

const route = fs
  .readFileSync("apps/api/app/api/wine-menu-recommendation/route.ts", "utf8")
  .replace(/\r\n/g, "\n");
const recommendAi = fs
  .readFileSync("apps/api/src/ai/recommendConcreteWineForMainDishAI.ts", "utf8")
  .replace(/\r\n/g, "\n");

assert(
  !route.includes("Vorstrukturierte WineCandidates:"),
  "route.ts must no longer embed a second, duplicate wineCandidates block in source.text"
);
assert(
  !/text:\s*\[[\s\S]*?JSON\.stringify\(wineCandidates\)/.test(route),
  "route.ts's source.text must not JSON.stringify(wineCandidates) at all - that stays the sole responsibility of buildConcreteWinePrompt"
);
assert(
  route.includes('text: ["Originale Weinkartenquelle:", menuSourceText].join("\\n")'),
  "source.text must still carry the raw original menu source text (menuSourceText) - only the duplicate structured candidate list was removed"
);

// Die eigentliche, einzige verbleibende Einbettung muss weiterhin existieren -
// sonst wuerde die KI gar keine wineCandidates mehr sehen.
assert(
  recommendAi.includes("WineCandidates als einzige Quelle fuer konkrete Weine:") &&
    recommendAi.includes("JSON.stringify(wineCandidates)"),
  "buildConcreteWinePrompt must still be the single remaining place that sends wineCandidates to the model"
);

// wineCandidates muss weiterhin strukturiert als Parameter durchgereicht
// werden (fuer die programmatische sourceEvidence-Zuordnung in
// parseConcreteWine) - dieser Fix veraendert nur den Prompt-Text, keine Logik.
assert(
  route.includes("wineCandidates,") && route.includes("const wineCandidates = extractWineCandidates(menuSourceText);"),
  "wineCandidates extraction and pass-through to recommendConcreteWineForMainDishAI must be unchanged"
);
assert(
  recommendAi.includes("const matchingCandidate = wineCandidates.find((candidate) => candidate.sourceEvidence === sourceEvidence);"),
  "sourceEvidence-based candidate matching logic must be unchanged"
);

console.log("wine candidate duplicate token regression passed");
