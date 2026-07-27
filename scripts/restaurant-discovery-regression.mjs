import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8").replace(/\r\n/g, "\n");
const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const restaurantDiscoveryRoute = read("apps/api/app/api/restaurant-discovery/route.ts");
const restaurantMenuDiscoveryRoute = read("apps/api/app/api/restaurant-menu-discovery/route.ts");
const discoveryService = read("apps/api/src/restaurant/discoverRestaurantSource.ts");
const menuSourceSelector = read("apps/api/src/restaurant/selectRestaurantMenuSource.ts");
const menuParser = read("apps/api/src/menu/parseMenu.ts");
const textAiFacts = read("apps/api/src/ai/extractMenuFactsFromTextAI.ts");
const analyzeRoute = read("apps/api/app/api/analyze-menu/route.ts");
const mobileApi = read("apps/mobile/src/api/pickformeApi.ts");

assert(restaurantDiscoveryRoute.includes("requireUser(request)"), "Restaurant discovery route must be auth-gated");
assert(restaurantDiscoveryRoute.includes("discoverRestaurantCandidatesOnly(body)"), "Restaurant discovery route must return restaurant candidates only");
assert(restaurantDiscoveryRoute.includes("RestaurantDiscoveryRequestSchema"), "Restaurant discovery route must validate request shape");
assert(!restaurantDiscoveryRoute.includes("discoverRestaurantSources("), "Restaurant discovery route must stay candidates-only and never call the one-shot auto-resolve pipeline");
assert(restaurantDiscoveryRoute.includes("MAX_DISCOVERY_SEARCHES_PER_DAY") && restaurantDiscoveryRoute.includes("enforceDailySearchLimit"), "Restaurant discovery route must keep the daily search cost brake");

// Die frühere Minimalversion war komplett aus der Mobile-App entfernt ("retired").
// Seit der Wiedereinführung als zweistufiger, nutzerbestätigter Ablauf
// (Suche -> Trefferliste -> Bestätigung -> Speisekarten-Isolierung) darf die
// Mobile-App /api/restaurant-discovery wieder aufrufen. Was weiterhin verboten
// bleibt: der automatische Ein-Schritt-Pfad discoverRestaurantSources(), der
// ohne Nutzerbestätigung Restaurant + Speisekarte in einem Rutsch auflösen
// würde - das war das eigentliche Sicherheitsrisiko, nicht der Funktionsname.
assert(!mobileApi.includes("discoverRestaurantSources("), "Mobile app must never call the one-shot auto-resolve restaurant discovery pipeline");

assert(restaurantMenuDiscoveryRoute.includes("requireUser(request)"), "Restaurant menu discovery route must be auth-gated");
assert(restaurantMenuDiscoveryRoute.includes("RestaurantMenuDiscoveryRequestSchema"), "Restaurant menu discovery route must validate selected restaurant shape");
assert(restaurantMenuDiscoveryRoute.includes("selectRestaurantMenuSource"), "Restaurant menu discovery route must use shared menu source selection");
assert(restaurantMenuDiscoveryRoute.includes("MENU_DISCOVERY_TIMEOUT_MS"), "Restaurant menu discovery must have a governed timeout");
assert(restaurantMenuDiscoveryRoute.includes("websiteUrl") && restaurantMenuDiscoveryRoute.includes("menuUrl"), "Restaurant menu discovery must return website and menu URL fields");
assert(restaurantMenuDiscoveryRoute.includes("confidence") && restaurantMenuDiscoveryRoute.includes("selection.confidence"), "Restaurant menu discovery must surface confidence so the app can decide when to require confirmation");

assert(discoveryService.includes("web_search_preview"), "Restaurant discovery must use the governed web search provider");
assert(discoveryService.includes("discoverRestaurantCandidatesOnly"), "Restaurant-only discovery entrypoint missing");
assert(discoveryService.includes("discoverRestaurantSources"), "Full restaurant source discovery entrypoint missing");
assert(discoveryService.includes("buildMenuRecoveryPrompt") && discoveryService.includes("hasAnalyzableMenuCandidate"), "Full discovery must keep menu-focused recovery");
assert(discoveryService.includes("buildLikelyOfficialWebsiteCandidates") && discoveryService.includes("addVerifiedMenuCandidate"), "Full discovery must probe likely official domains only as verified menu candidates");
assert(discoveryService.includes("getRegistrableDomain") && discoveryService.includes("verifyReachableUrl"), "Discovery URL guards missing");
assert(discoveryService.includes("loadMenuTextFromUrl") && discoveryService.includes("verifyDirectAnalyzableMenuUrl"), "Discovery must preflight menu URLs with the shared loader");
assert(discoveryService.includes("findSameDomainAnalyzableMenuUrl") && discoveryService.includes("findLinkedAnalyzableMenuUrl"), "Discovery crawler must resolve same-domain analyzable menu URLs");
assert(discoveryService.includes("return parseMenu(menuText).length >= 2"), "Full discovery must fail closed when fewer than two menu entries are parseable");
assert(discoveryService.includes("contentMatchesRestaurant") && discoveryService.includes("sourceTextMatchesRestaurant(name, text) && sourceTextMatchesCity(city, text)"), "Restaurant candidate verification must check page content against the searched restaurant, not just URL reachability");

assert(menuSourceSelector.includes("selectRestaurantMenuSource"), "Shared menu source selector missing");
assert(menuSourceSelector.includes("loadMenuTextFromUrl"), "Shared menu source selector must use the shared loader");
assert(menuSourceSelector.includes("parseMenu(trimmed).filter((dish) => dish.itemType !== \"drink\").length >= 2"), "Shared menu source selector must require at least two non-drink menu entries");
assert(menuSourceSelector.includes("trustedExternalProvider"), "Shared menu source selector must keep trusted external provider handling");
assert(menuSourceSelector.includes("rejectedCandidates"), "Shared menu source selector must keep rejected candidate diagnostics");

assert(menuParser.includes('itemType: isDrink ? "drink" : "dish"') && menuParser.includes('dishRole: isDrink ? "drink" : undefined'), "Menu parser must classify recognized drinks as drink items");
assert(textAiFacts.includes("Getraenke duerfen niemals itemType dish bekommen"), "Text AI extraction prompt must protect dish classification from drinks");
assert(textAiFacts.includes("coerceMenuItemType") && textAiFacts.includes('itemType: "drink"'), "Text AI facts validation must correct obvious drink items away from dish");

assert(analyzeRoute.includes('responseMode: "ai_pdf"'), "Analyze route must keep the PDF Two-Step AI path");
assert(analyzeRoute.includes('mainAiInputMode: "extracted_text"') && analyzeRoute.includes('mainAiInputMode: "pdf_file_fallback"'), "Analyze route must keep both PDF extracted-text and file-fallback modes");
assert(analyzeRoute.includes("SAFE_ANALYSIS_NOT_POSSIBLE_MESSAGE"), "Analyze route must keep safe closed-failure messaging");
assert(analyzeRoute.includes("TEXT_AI_TIMEOUT_MS") && analyzeRoute.includes("PDF_AI_TIMEOUT_MS"), "Analyze route must keep governed AI timeouts");
assert(analyzeRoute.includes('message.includes("TEXT_AI_TIMEOUT")') && !analyzeRoute.includes("falling back to local recommendation"), "Analyze route must not silently fall back to local recommendations after AI timeout");
assert(analyzeRoute.includes("parsedMenuItems.filter(isFoodDish)") && analyzeRoute.includes('dish.itemType !== "drink"'), "Analyze route must keep drink items out of food recommendations");
assert(analyzeRoute.includes('throw new AppError(400, "PDF_AI_DISABLED"'), "Analyze route must fail closed for PDF links when AI is disabled");

console.log("restaurant-discovery-regression: passed");
