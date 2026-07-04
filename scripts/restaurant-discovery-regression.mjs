import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const pickScreen = read("apps/mobile/src/screens/pick/PickScreen.tsx");
const menuInput = read("apps/mobile/src/components/pick/MenuInputCard.tsx");
const dialog = read("apps/mobile/src/components/pick/RestaurantDiscoveryDialog.tsx");
const routine = read("apps/mobile/src/gustaroai/restaurantDiscoveryRoutine.ts");
const mobileApi = read("apps/mobile/src/api/pickformeApi.ts");
const backendRoute = read("apps/api/app/api/restaurant-discovery/route.ts");
const backendService = read("apps/api/src/restaurant/discoverRestaurantSource.ts");
const analyzeRoute = read("apps/api/app/api/analyze-menu/route.ts");
const content = JSON.parse(read("apps/mobile/src/content/mobileContent.de-DE.json"));

assert(content.pick.findMenuButton === "Speisekarte finden", "Button text missing");
assert(pickScreen.includes("content.pick.findMenuButton"), "PickScreen does not render discovery button");
assert(pickScreen.includes("<MenuInputCard menuText={menuText} setMenuText={setMenuText} compact />"), "Menu input is not compacted");
assert(menuInput.includes("textAreaCompact") && menuInput.includes("height: 68"), "Compact input height missing");
assert(dialog.includes("generateRestaurantCandidates") && dialog.includes("showCandidates"), "Candidate search binding missing");
assert(dialog.includes("gustaroaiRestaurantDiscoveryProvider"), "Dialog does not use GustaroAI backend discovery provider");
assert(mobileApi.includes('"/api/restaurant-discovery"'), "Mobile API does not call restaurant discovery backend");
assert(backendRoute.includes("requireUser(request)"), "Restaurant discovery backend route is not auth-gated");
assert(backendService.includes("web_search_preview"), "Backend discovery does not use web search provider");
assert(backendService.includes("buildMenuRecoveryPrompt") && backendService.includes("hasAnalyzableMenuCandidate"), "Backend discovery does not run menu-focused recovery when first-pass candidates have no analyzable menu");
assert(backendService.includes("buildLikelyOfficialWebsiteCandidates") && backendService.includes("addVerifiedMenuCandidate"), "Backend discovery does not probe likely official domains only as verified menu candidates");
assert(backendService.includes("getRegistrableDomain") && backendService.includes("verifyReachableUrl"), "Backend discovery URL guards missing");
assert(backendService.includes("loadMenuTextFromUrl") && backendService.includes("verifyAnalyzableMenuUrl"), "Backend discovery does not preflight menu URLs with the shared loader");
assert(backendService.includes("parseMenu(menuText)") && backendService.includes("isAnalyzableMenuText"), "Backend discovery does not validate menu text analyzability");
assert(backendService.includes("findSameDomainAnalyzableMenuUrl"), "Backend discovery crawler does not require analyzable menu URLs");
assert(backendService.includes("buildLikelyMenuUrls") && backendService.includes("/menu/"), "Backend discovery crawler does not probe likely menu paths");
assert(analyzeRoute.includes("const menuTextUrl = pdfMenuUrl || rawMenuText"), "Analyze route does not route discovered PDF menu URLs through the shared loader");
assert(analyzeRoute.includes("loadMenuTextFromUrl(menuTextUrl)"), "Analyze route does not load PDF/menu URLs through the shared text loader");
assert(!analyzeRoute.includes('throw new AppError(400, "PDF_AI_DISABLED"'), "Analyze route must not hard-block PDF menu links before text extraction");
assert(dialog.includes("DOUBLE_TAP_WINDOW_MS") && dialog.includes("setSelectedCandidate(candidate)"), "Double-tap selection missing");
assert(dialog.includes("disabled={loadingMenu || !selectedCandidate}"), "Menu button is not gated by selected restaurant");
assert(content.restaurantDiscovery.noMenuUrl === "Kein auswertbarer Speisekartenlink gefunden. Bitte Link, Text oder Foto manuell einfügen", "Exact no-menu-url message changed");
assert(dialog.includes("onApply(menuUrl)"), "Apply does not return the menu URL");
assert(dialog.includes("onClose") && content.restaurantDiscovery.backButton === "zur\u00fcck", "Back flow missing");
assert(routine.includes("gustaroai-api"), "GustaroAI backend provider missing");
assert(/async loadCandidateLinks\(candidate\) {\s+if \(candidate\.menuUrl\) {\s+return \[\{ url: candidate\.menuUrl, kind: "menu" \}\];\s+}\s+return \[\];\s+},/.test(routine), "GustaroAI backend provider must not bypass backend analyzability checks with local crawling");
assert(routine.includes("getRegistrableDomain(menuUrl) !== websiteDomain"), "Same-domain guard missing");
assert(routine.includes("kind !== \"menu\""), "Structured menu kind guard missing");

console.log("Restaurant discovery regression checks passed.");