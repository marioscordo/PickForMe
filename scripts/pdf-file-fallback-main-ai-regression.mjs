import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const mainAi = read("apps/api/src/ai/recommendMainDishesAI.ts");
const route = read("apps/api/app/api/analyze-menu/route.ts");
const utils = read("apps/api/src/ai/twoStepRecommendationAIUtils.ts");
const schemas = read("apps/api/src/ai/twoStepRecommendationSchemas.ts");

assert(
  mainAi.includes("source: TwoStepMenuSourceInput;") &&
    mainAi.includes("source\n    })"),
  "Main AI prompt builder must receive source metadata"
);
assert(
  mainAi.includes("function buildPdfFileFallbackRules(source: TwoStepMenuSourceInput, activePreferences: string[])"),
  "PDF fallback prompt rules must be isolated in a dedicated helper"
);
assert(
  mainAi.includes('source.kind !== "pdf" || source.mainAiInputMode !== "pdf_file_fallback"'),
  "PDF fallback rules must be gated to pdf_file_fallback only"
);
assert(
  mainAi.includes('"PDF-Datei-Fallback ohne extrahierbaren Text:"'),
  "PDF fallback rules must have an explicit marker"
);
assert(
  mainAi.includes("Pruefe jede Seite der bereitgestellten PDF-Datei vollstaendig") &&
    mainAi.includes("Beende die Suche nicht nach den ersten passenden Gerichten") &&
    mainAi.includes("Beruecksichtige Gerichte aus allen Seiten"),
  "PDF fallback must require complete page coverage"
);
assert(
  mainAi.includes("Suche auf allen Seiten ausdruecklich nach Gerichten, die zu den aktiven Vorlieben passen") &&
    mainAi.includes("Bevorzuge bestaetigte Vorliebenuebereinstimmungen") &&
    mainAi.includes("Ergaenze Kandidaten ohne Vorliebenuebereinstimmung nur"),
  "PDF fallback must search and prioritize active preferences without hard-filtering them"
);
assert(
  mainAi.includes("Uebernehme sichtbare Originalbeschreibungen aus der PDF in descriptionOriginal") &&
    mainAi.includes("Wenn keine Beschreibung sichtbar ist, lasse descriptionOriginal und translatedDescription null") &&
    mainAi.includes("Erfinde keine Zutaten, Zubereitungsarten oder Beschreibungen aus allgemeinem Kuechenwissen"),
  "PDF fallback must preserve visible descriptions and forbid invented descriptions"
);
assert(
  mainAi.includes("Kandidaten muessen tatsaechlich in der PDF sichtbar sein") &&
    mainAi.includes("Halte das bestehende Kandidatenlimit ein"),
  "PDF fallback must remain source-bound and keep the existing candidate limit"
);
assert(
  mainAi.includes("...pdfFileFallbackRules,\n    \"- Alle Ausschluesse"),
  "PDF fallback rules must be injected only into the Main AI prompt rule list"
);

assert(
  route.includes('mainAiInputMode: "extracted_text"') &&
    route.includes('mainAiInputMode: "pdf_file_fallback"'),
  "Analyze route must keep the existing text-PDF and file-fallback modes"
);
assert(
  utils.includes('source.mainAiInputMode !== "extracted_text"') &&
    utils.includes('type: "input_file" as const') &&
    utils.includes(".slice(0, 8)"),
  "PDF fallback must still use the existing single input_file path and file count limit"
);
assert(
  schemas.includes('.max(10, "Main AI compact response must not contain more than 10 dishes")') &&
    mainAi.includes("Liefere maximal 10 Compact-Dishes") &&
    !mainAi.includes("15 Compact-Dishes"),
  "Candidate limit must remain 10 with no 10/15 change"
);
assert(
  count(mainAi, "client.responses.create(request") === 1,
  "Main AI must still perform exactly one model request"
);
assert(
  count(mainAi, "verifyRecommendationSafetyAI({") === 1,
  "Safety verifier call count must remain unchanged"
);
assert(
  !route.includes("buildPdfFileFallbackRules") &&
    !utils.includes("PDF-Datei-Fallback ohne extrahierbaren Text"),
  "PDF fallback instruction must not leak into route or source-content construction"
);

console.log("pdf-file-fallback-main-ai-regression: passed");

function count(value, needle) {
  return value.split(needle).length - 1;
}
