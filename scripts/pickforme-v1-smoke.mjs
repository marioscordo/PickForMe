const BASE_URL = process.env.PICKFORME_API_URL ?? "http://localhost:3000";
const DEV_EMAIL = process.env.PICKFORME_DEV_EMAIL ?? "mario.scordo@t-online.de";
const RUN_PDF_SMOKE = process.env.RUN_PDF_SMOKE === "1";
const PDF_URL =
  process.env.PICKFORME_SMOKE_PDF_URL ??
  "https://www.ahstatic.com/pdf/b4h1_rsr001_00_t_x_gb.pdf";

const PROFILE = {
  displayName: "Smoke Test Nutzer",
  primaryLikes: ["proteinreich", "kräftig"],
  secondaryLikes: ["italienisch"],
  dislikes: ["Innereien"],
  intolerances: ["Grätenfisch"],
  dietStyle: "normal",
  exceptions: [],
  customPreferences: [],
  customExclusions: [],
  customIntolerances: [],
  customExceptions: [],
  hiddenPreferences: [],
  hiddenExclusions: [],
  hiddenIntolerances: [],
  hiddenExceptions: [],
  recommendationFeedback: []
};

const TEXT_MENU = `
Filetto di manzo danese alla griglia
Gegrilltes dänisches Rindfleisch-Filet
19,00 €

Entrecote di manzo danese alla griglia
Gegrilltes dänisches Rindfleisch-Entrecôte
18,00 €

Spaghetti alle vongole
Spaghetti mit Venusmuscheln
16,00 €

Trippa alla romana
Römische Kutteln
14,00 €
`;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function analyze(name, menuText, timeoutMs = 60000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  let rawText;

  try {
    response = await fetch(`${BASE_URL}/api/analyze-menu`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-pickforme-dev-email": DEV_EMAIL
      },
      body: JSON.stringify({
        sourceKind: "text",
        menuText,
        profile: PROFILE,
        situation: "richtig_hunger"
      }),
      signal: controller.signal
    });

    rawText = await response.text();
  } finally {
    clearTimeout(timer);
  }

  let json;

  try {
    json = JSON.parse(rawText);
  } catch {
    throw new Error(`${name}: Antwort ist kein JSON: ${rawText.slice(0, 500)}`);
  }

  if (!response.ok || json.ok !== true) {
    throw new Error(`${name}: API-Fehler ${response.status}: ${JSON.stringify(json).slice(0, 1200)}`);
  }

  const data = json.data;
  const dishes = Array.isArray(data?.dishes) ? data.dishes : [];
  const recommendations = Array.isArray(data?.recommendations) ? data.recommendations : [];

  assert(dishes.length >= 1, `${name}: keine Gerichte erhalten`);
  assert(recommendations.length >= 1, `${name}: keine Empfehlungen erhalten`);

  const firstRecommendation = recommendations[0];
  const matchingDish =
    firstRecommendation.dish ??
    dishes.find((dish) => dish.id === firstRecommendation.dishId) ??
    dishes[0];

  const originalName =
    matchingDish?.nameOriginal ??
    firstRecommendation.nameOriginal ??
    matchingDish?.name ??
    "";

  const visibleSecondLine =
    firstRecommendation.translatedName ??
    matchingDish?.translatedName ??
    matchingDish?.descriptionOriginal ??
    matchingDish?.sourceLine ??
    "";

  const reason = firstRecommendation.reason ?? "";

  assert(String(originalName).trim().length > 0, `${name}: Originalname fehlt`);
  assert(String(visibleSecondLine).trim().length > 0, `${name}: sichtbare zweite Zeile fehlt`);
  assert(String(reason).trim().length > 0, `${name}: reason fehlt`);

  console.log(`✅ ${name}`);
  console.log(`   Gerichte: ${dishes.length}`);
  console.log(`   Empfehlungen: ${recommendations.length}`);
  console.log(`   Erste Empfehlung: ${originalName}`);
  console.log(`   Zweite Zeile: ${visibleSecondLine}`);
  console.log("");
}

async function main() {
  console.log("PickForMe V1 Smoke-Test");
  console.log(`API: ${BASE_URL}`);
  console.log("");

  await analyze("Text-Speisekarte", TEXT_MENU, 30000);

  if (RUN_PDF_SMOKE) {
    await analyze("PDF-Speisekarte", PDF_URL, 70000);
  } else {
    console.log("ℹ️ PDF-Smoke-Test übersprungen.");
    console.log("   Aktivieren mit: $env:RUN_PDF_SMOKE='1'");
    console.log("");
  }

  console.log("✅ PickForMe V1 Kernfunktion ist stabil.");
}

main().catch((error) => {
  console.error("");
  console.error("❌ PickForMe V1 Smoke-Test fehlgeschlagen.");
  console.error(error);
  process.exit(1);
});


