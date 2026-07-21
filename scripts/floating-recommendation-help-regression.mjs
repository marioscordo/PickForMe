import { readFileSync } from "node:fs";

function read(path) {
  return readFileSync(path, "utf8");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertBefore(source, before, after, message) {
  const beforeIndex = source.indexOf(before);
  const afterIndex = source.indexOf(after);
  assert(beforeIndex >= 0, `${message}: missing before marker`);
  assert(afterIndex >= 0, `${message}: missing after marker`);
  assert(beforeIndex < afterIndex, message);
}

function between(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert(start >= 0, `Missing start marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert(end >= 0, `Missing end marker: ${endMarker}`);
  return source.slice(start, end);
}

const screen = read("apps/mobile/src/components/ui/Screen.tsx");
const pickScreen = read("apps/mobile/src/screens/pick/PickScreen.tsx");
const help = read("apps/mobile/src/components/ui/GustaroHelp.tsx");
const deContent = read("apps/mobile/src/content/mobileContent.de-DE.json");
const enContent = read("apps/mobile/src/content/mobileContent.en-US.json");
const recommendationCard = read("apps/mobile/src/components/pick/RecommendationCard.tsx");

assert(screen.includes("floatingAccessory?: React.ReactNode"), "Screen must expose an optional floating accessory slot");
assert(screen.includes("floatingAccessory,"), "Screen must destructure the optional floating accessory prop");
assert(screen.includes("{floatingAccessory ? ("), "Screen must render the floating accessory only when provided");
assert(screen.includes("pointerEvents=\"box-none\""), "Floating accessory container must not create a full touch-blocking overlay");
assert(screen.includes("style={local.floatingAccessory}"), "Screen must use a dedicated floating accessory style");
assert(screen.includes("position: \"absolute\""), "Floating accessory must be absolutely positioned");
assert(screen.includes("right: 18"), "Floating accessory must be positioned at the right screen edge");
assert(screen.includes("top: 20"), "Floating accessory must sit below the SafeAreaView top edge");
assert(screen.includes("zIndex: 6"), "Floating accessory must layer above scroll content");
assert(screen.includes("elevation: 6"), "Floating accessory must account for Android layering");
assertBefore(screen, "<ScrollView", "{children}", "Screen children must remain inside the ScrollView");
assertBefore(screen, "</ScrollView>", "{floatingAccessory ? (", "Floating accessory must render outside the ScrollView");
assertBefore(screen, "{floatingAccessory ? (", "{showScrollHint && canScrollFurther", "Floating accessory must not replace the existing scroll hint");

const resultBranch = between(pickScreen, "if (analyze.result) {", "if (showPhotoCamera) {");
assert(resultBranch.includes("floatingAccessory={<GustaroHelp common={content.help.common} topic={content.help.result} />}"), "PickScreen must pass result help as the Screen floating accessory");
assert(!resultBranch.includes("resultHelpRow"), "Result branch must not keep the old scroll-content help row");
assert(!pickScreen.includes("resultHelpRow:"), "Old result help row style must be removed");
assert(resultBranch.indexOf("<GustaroHelp") === resultBranch.lastIndexOf("<GustaroHelp"), "Result branch must render exactly one GustaroHelp instance");
assert(resultBranch.includes("<RecommendationCard"), "Result branch must still render RecommendationCard");
assert(resultBranch.includes("showStartersAndSaladsAction={recommendationMode === \"main_course\"}"), "Main and starter/salad modes must continue through the same result branch");
assert(resultBranch.includes("contentContainerStyle={local.resultScreenContent}"), "Result branch must keep a local result content style");
assert(pickScreen.includes("resultScreenContent:") && pickScreen.includes("paddingTop: s(68)"), "Result content must reserve top space for the floating help button");
assert(!resultBranch.includes("navigation") && !resultBranch.includes("onOpenProfile"), "Floating result help must not introduce navigation changes");

assert(help.includes("const [visible, setVisible] = useState(false)"), "GustaroHelp must keep its own modal state");
assert(help.includes("onPress={() => setVisible(true)}"), "GustaroHelp open handler must remain local");
assert(help.includes("<Modal animationType=\"fade\" transparent visible={visible} onRequestClose={close}>"), "GustaroHelp modal must remain unchanged");
assert(help.includes("accessibilityRole=\"button\""), "GustaroHelp button accessibility role must remain available");
assert(help.includes("accessibilityLabel={common.openAccessibilityLabel}"), "GustaroHelp accessibility label must remain content-driven");
assert(help.includes("hitSlop={8}"), "GustaroHelp hitSlop must remain unchanged");

assert(recommendationCard.includes('result.recommendationResultType === "uncertain_review"'), "Uncertain-review results must remain inside RecommendationCard result handling");
assert(recommendationCard.includes("safeRecommendations.length === 0"), "One, two, three, and zero recommendation states must remain RecommendationCard variants");

const deHelp = JSON.parse(deContent).help.result.points;
const enHelp = JSON.parse(enContent).help.result.points;
const deNew = "Du kannst einmalig zusätzlich „Vorspeisen & Salate“ auswählen und dafür passende Empfehlungen aus derselben Speisekarte erhalten.";
const deReset = "„Neue Speisekarte zeigen“ verwirft die aktuelle Empfehlung und startet den Weg zu einer neuen Analyse.";
const enNew = "You can also select “Starters & Salads” once and receive suitable recommendations from the same menu.";
const enReset = "'Show new menu' discards the current recommendation and starts the path to a new analysis.";
assert(deHelp.includes(deNew), "German result help text must include the new starter/salad point");
assert(enHelp.includes(enNew), "English result help text must include the new starter/salad point");
assert(deHelp.indexOf(deNew) === deHelp.indexOf(deReset) - 1, "German starter/salad point must be directly before the reset-menu point");
assert(enHelp.indexOf(enNew) === enHelp.indexOf(enReset) - 1, "English starter/salad point must be directly before the reset-menu point");

assert(!screen.includes("fetch(") && !pickScreen.includes("fetch("), "Floating help change must not add direct network calls");
assert(!screen.includes("analyze.run") && resultBranch.includes("analyze.result"), "Screen floating slot must not affect analyze execution");

console.log("floating recommendation help regression passed");
