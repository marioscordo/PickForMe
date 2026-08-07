import fs from "node:fs";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function read(path) {
  return fs.readFileSync(path, "utf8").replace(/\r\n/g, "\n");
}

// Produktidee Aug 2026 (Mario): wenn GustaroAI wegen der Allergene/
// Ausschluesse des Nutzers gar kein sicheres Gericht mehr findet
// (NO_SAFE_RECOMMENDATIONS), bietet die App an, eine Frage in der Sprache
// der Speisekarte zu formulieren, mit der der Nutzer das Personal direkt
// fragen kann. Bestaetigt der Nutzer, wird die (bereits bestehende)
// Bestellliste-Optik mit dieser Frage gezeigt. Rein additiv an einem
// bisher toten Fehlerzustand - siehe Commit-Beschreibung fuer die volle
// Risikoanalyse.

const staffQuestionAi = read("apps/api/src/ai/generateAllergyStaffQuestionAI.ts");
const staffQuestionRoute = read("apps/api/app/api/allergy-staff-question/route.ts");
const analyzeRoute = read("apps/api/app/api/analyze-menu/route.ts");
const mobileTypes = read("apps/mobile/src/types/recommendations.ts");
const useAnalyzeMenu = read("apps/mobile/src/hooks/useAnalyzeMenu.ts");
const pickformeApi = read("apps/mobile/src/api/pickformeApi.ts");
const pickScreen = read("apps/mobile/src/screens/pick/PickScreen.tsx");
const deDE = read("apps/mobile/src/content/mobileContent.de-DE.json");
const enUS = read("apps/mobile/src/content/mobileContent.en-US.json");

// 1) Neuer KI-Baustein: Sprache = Kartensprache (ISO-Code direkt, kein
// Namens-Lookup), English-Fallback bei unknown/fehlend, nutzt die
// bestehende Profil-Prompt-Logik statt eigene Allergen-Beschreibung neu zu
// erfinden.
assert(
  staffQuestionAi.includes("export async function generateAllergyStaffQuestionAI("),
  "generateAllergyStaffQuestionAI must be exported"
);
assert(
  staffQuestionAi.includes("function resolveStaffQuestionLanguageCode(menuLanguage: MenuLanguage | undefined) {") &&
    staffQuestionAi.includes('return menuLanguage && menuLanguage !== "unknown" ? menuLanguage : "en";'),
  "the staff question language must fall back to English when menuLanguage is unknown or missing, matching the sommelierPhrase precedent"
);
assert(
  staffQuestionAi.includes("...buildProfilePromptLines(profile)"),
  "the prompt must reuse buildProfilePromptLines() for the user's allergens/exclusions instead of duplicating that logic"
);
assert(
  !staffQuestionAi.includes("getLanguageNameForLocale"),
  "the staff question language must not go through the free-form locale name lookup table - the raw menuLanguage ISO code is passed directly to the model"
);

// 2) Neuer, eigenstaendiger Endpoint: auth-geschuetzt, validiert
// menuLanguage gegen das geschlossene Enum, ruft den neuen Baustein auf.
assert(
  staffQuestionRoute.includes('await requireUser(request);'),
  "the new endpoint must require authentication like the other recommendation endpoints"
);
assert(
  staffQuestionRoute.includes("generateAllergyStaffQuestionAI({"),
  "the route must call the new AI module"
);
assert(
  staffQuestionRoute.includes("MenuLanguageSchema.safeParse(value)"),
  "menuLanguage from the client must be validated against the closed MenuLanguageSchema enum"
);

// 3) analyze-menu/route.ts: menuLanguage + orderLabels werden bei
// NO_SAFE_RECOMMENDATIONS mitgeschickt, damit Mobile ohne erneute
// Karten-Analyse die Frage anfordern kann.
assert(
  analyzeRoute.includes("...(menuLanguage ? { menuLanguage, orderLabels: buildOrderLabelsForMenuLanguage(menuLanguage) } : {})"),
  "buildMenuAnalysisDetails must attach menuLanguage and the matching orderLabels when menuLanguage is known"
);
const noSafeThrowCount = (analyzeRoute.match(
  /buildMenuAnalysisDetails\(localizedRestaurantDescription, htmlMenuExtraction, mainDishResult\.menuLanguage\)/g
) ?? []).length;
assert(
  noSafeThrowCount === 2,
  `both NO_SAFE_RECOMMENDATIONS throw sites must pass mainDishResult.menuLanguage into buildMenuAnalysisDetails, found ${noSafeThrowCount}`
);

// 4) Mobile-Typen fuer die neuen Datenformen.
assert(
  mobileTypes.includes("export type AnalyzeMenuErrorDetails = {") &&
    mobileTypes.includes("menuLanguage?: MenuLanguage;") &&
    mobileTypes.includes("orderLabels?: OrderLabels;"),
  "mobile types must declare AnalyzeMenuErrorDetails with menuLanguage and orderLabels"
);
assert(
  mobileTypes.includes("export type AllergyStaffQuestionData = {") && mobileTypes.includes("question: string | null;"),
  "mobile types must declare AllergyStaffQuestionData"
);

// 5) useAnalyzeMenu.ts: error.details wird defensiv geparst und ueber den
// Hook exponiert - das ist der Pfad, der bislang komplett ungenutzt war.
assert(
  useAnalyzeMenu.includes("const [errorDetails, setErrorDetails] = useState<AnalyzeMenuErrorDetails | null>(null);"),
  "useAnalyzeMenu must track errorDetails state"
);
assert(
  useAnalyzeMenu.includes("function extractAnalyzeMenuErrorDetails(details: unknown): AnalyzeMenuErrorDetails | null {"),
  "useAnalyzeMenu must defensively parse the unknown error.details payload"
);
assert(
  useAnalyzeMenu.includes("setErrorDetails(e instanceof PickForMeApiError ? extractAnalyzeMenuErrorDetails(e.details) : null);"),
  "the real error branch must populate errorDetails from the PickForMeApiError details"
);
assert(
  /return \{[\s\S]{0,200}errorDetails,/.test(useAnalyzeMenu),
  "errorDetails must be exposed from the hook's return value"
);

// 6) pickformeApi.ts: neue on-demand API-Funktion, nicht in jeden
// gescheiterten Analyse-Versuch eingebettet.
assert(
  pickformeApi.includes('export function requestAllergyStaffQuestion(') &&
    pickformeApi.includes('"/api/allergy-staff-question"'),
  "pickformeApi.ts must expose requestAllergyStaffQuestion targeting the new endpoint"
);
assert(
  pickformeApi.includes("profile: sanitizeProfileForApi(args.profile)"),
  "the staff question request must reuse the existing profile sanitizer, not send the raw client profile"
);

// 7) PickScreen.tsx: Angebot nur bei NO_SAFE_RECOMMENDATIONS + bekannter
// menuLanguage, "Nein danke" blendet es fuer diesen Fehlerzustand aus,
// State wird bei jeder neuen Fehlermeldung zurueckgesetzt (kein Leck
// zwischen zwei Analyse-Versuchen).
assert(
  pickScreen.includes('analyze.errorCode === "NO_SAFE_RECOMMENDATIONS" && analyze.errorDetails?.menuLanguage && staffQuestionStatus !== "declined"'),
  "the staff question offer must only render for NO_SAFE_RECOMMENDATIONS with a known menuLanguage, and must respect a prior decline"
);
assert(
  pickScreen.includes('setStaffQuestionStatus("declined");'),
  "declining the offer must be tracked so it does not reappear for the same failed attempt"
);
assert(
  /useEffect\(\(\) => \{\s*staffQuestionAbortControllerRef\.current\?\.abort\(\);[\s\S]{0,200}\}, \[analyze\.error\]\);/.test(pickScreen),
  "staff question state must reset whenever the analyze error changes, so it cannot leak into a different search attempt"
);
assert(
  pickScreen.includes("analyze.errorDetails?.orderLabels?.title ?? content.staffQuestionOffer.fallbackTitle"),
  "the staff-question order list must use the menu-language orderLabels title, with a safe fallback"
);
assert(
  !pickScreen.includes("local.orderScreen") ,
  "the new staff-question screen must use its own styles, not touch the existing per-dish order list in RecommendationCard.tsx"
);

// 8) Neue Inhalte in beiden Sprachdateien.
assert(deDE.includes('"staffQuestionOffer"'), "German content must define the new staffQuestionOffer section");
assert(enUS.includes('"staffQuestionOffer"'), "English content must define the new staffQuestionOffer section");

console.log("allergy staff question regression passed");
