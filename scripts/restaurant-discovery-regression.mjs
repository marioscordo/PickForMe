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
const content = JSON.parse(read("apps/mobile/src/content/mobileContent.de-DE.json"));

assert(content.pick.findMenuButton === "Speisekarte finden", "Button text missing");
assert(pickScreen.includes("content.pick.findMenuButton"), "PickScreen does not render discovery button");
assert(pickScreen.includes("<MenuInputCard menuText={menuText} setMenuText={setMenuText} compact />"), "Menu input is not compacted");
assert(menuInput.includes("textAreaCompact") && menuInput.includes("height: 68"), "Compact input height missing");
assert(dialog.includes("generateRestaurantCandidates") && dialog.includes("showCandidates"), "Candidate search binding missing");
assert(dialog.includes("DOUBLE_TAP_WINDOW_MS") && dialog.includes("setSelectedCandidate(candidate)"), "Double-tap selection missing");
assert(dialog.includes("disabled={loadingMenu || !selectedCandidate}"), "Menu button is not gated by selected restaurant");
assert(content.restaurantDiscovery.noMenuUrl === "Kein auswertbarer Speisekartenlink gefunden", "Exact no-menu-url message changed");
assert(dialog.includes("onApply(menuUrl)"), "Apply does not return the menu URL");
assert(dialog.includes("onClose") && content.restaurantDiscovery.backButton === "zurück", "Back flow missing");
assert(routine.includes("same") || routine.includes("getRegistrableDomain(menuUrl) !== websiteDomain"), "Same-domain guard missing");
assert(routine.includes("kind !== \"menu\""), "Structured menu kind guard missing");

console.log("Restaurant discovery regression checks passed.");