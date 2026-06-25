const BASE_URL = process.env.PICKFORME_API_URL ?? "http://localhost:3000";
const DEV_EMAIL = process.env.PICKFORME_DEV_EMAIL ?? "mario.scordo@t-online.de";

const PDF_URL =
  process.env.PICKFORME_SPEED_PDF_URL ??
  "https://www.ahstatic.com/pdf/b4h1_rsr001_00_t_x_gb.pdf";

const RUN_PDF_SPEED = process.env.RUN_PDF_SPEED === "1";

const PROFILE = {
  displayName: "Speed Test Nutzer",
  primaryLikes: ["proteinreich", "kraeftig"],
  secondaryLikes: ["italienisch"],
  dislikes: ["Innereien"],
  intolerances: ["Graetenfisch"],
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
Gegrilltes daenisches Rindfleisch-Filet
19,00 EUR

Entrecote di manzo danese alla griglia
Gegrilltes daenisches Rindfleisch-Entrecote
18,00 EUR

Cordon Bleu vom Kalb
Kalb Cordon Bleu
21,00 EUR

Spaghetti alle vongole
Spaghetti mit Venusmuscheln
16,00 EUR
`;

function msToSeconds(ms) {
  return `${(ms / 1000).toFixed(2)} s`;
}

async function analyze(label, menuText, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = performance.now();

  try {
    const response = await fetch(`${BASE_URL}/api/analyze-menu`, {
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

    const raw = await response.text();
    const duration = performance.now() - startedAt;

    let json;

    try {
      json = JSON.parse(raw);
    } catch {
      console.log(`${label}: Kein JSON nach ${msToSeconds(duration)}`);
      console.log(raw.slice(0, 500));
      return;
    }

    if (!response.ok || json.ok !== true) {
      console.log(`${label}: FEHLER nach ${msToSeconds(duration)}`);
      console.log(JSON.stringify(json, null, 2));
      return;
    }

    const dishes = json.data?.dishes ?? [];
    const recommendations = json.data?.recommendations ?? [];
    const mode = json.data?.mode ?? "unknown";

    console.log(`${label}: ${msToSeconds(duration)}`);
    console.log(`  Modus: ${mode}`);
    console.log(`  Gerichte: ${dishes.length}`);
    console.log(`  Empfehlungen: ${recommendations.length}`);
    console.log("");
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  console.log("PickForMe V1 Speed-Test");
  console.log(`API: ${BASE_URL}`);
  console.log("");

  await analyze("Text-Speisekarte", TEXT_MENU, 40000);

  if (RUN_PDF_SPEED) {
    await analyze("PDF-Speisekarte", PDF_URL, 90000);
  } else {
    console.log("PDF-Speed-Test uebersprungen.");
    console.log("Aktivieren mit: $env:RUN_PDF_SPEED='1'");
    console.log("");
  }
}

main().catch((error) => {
  console.error("Speed-Test fehlgeschlagen.");
  console.error(error);
  process.exit(1);
});
