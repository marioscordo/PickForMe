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

const pickScreen = read("apps/mobile/src/screens/pick/PickScreen.tsx");
const useAnalyzeMenu = read("apps/mobile/src/hooks/useAnalyzeMenu.ts");
const recommendationCard = read("apps/mobile/src/components/pick/RecommendationCard.tsx");
const rootNavigator = read("apps/mobile/src/app/navigation/RootNavigator.tsx");
const appRoot = read("apps/mobile/src/app/AppRoot.tsx");
const profileProvider = read("apps/mobile/src/app/providers/ProfileProvider.tsx");
const supabaseClient = read("apps/mobile/src/services/supabaseClient.ts");

for (const [name, source] of [
  ["PickScreen", pickScreen],
  ["useAnalyzeMenu", useAnalyzeMenu],
  ["RecommendationCard", recommendationCard],
  ["RootNavigator", rootNavigator],
  ["AppRoot", appRoot]
]) {
  assert(!source.includes("AsyncStorage"), `${name} must not read or write persistent Pick state`);
  assert(!source.includes("SecureStore"), `${name} must not read or write secure persisted Pick state`);
  assert(!source.includes("getItem("), `${name} must not hydrate Pick state from storage`);
  assert(!source.includes("setItem("), `${name} must not persist Pick state to storage`);
}

assert(profileProvider.includes('const PROFILE_STORAGE_KEY = "gustaroai:user-profile:v1";'), "profile storage key must remain explicit");
assert(profileProvider.includes("AsyncStorage.getItem(PROFILE_STORAGE_KEY)"), "profile must still hydrate from its own storage key");
assert(profileProvider.includes("AsyncStorage.setItem(PROFILE_STORAGE_KEY"), "profile must still persist to its own storage key");
assert(supabaseClient.includes("persistSession: true"), "auth session persistence may remain separate from Pick state");

assert(pickScreen.includes('const [menuText, setMenuText] = useState("");'), "PickScreen must cold start with empty menu input");
assert(pickScreen.includes('const [menuInputOrigin, setMenuInputOrigin] = useState<MenuInputOrigin>("empty");'), "PickScreen must cold start with empty input origin");
assert(pickScreen.includes("useState<string | null>(null)"), "PickScreen must cold start without openable menu URL");
assert(!pickScreen.includes("normalizedMenuUrl && normalizedMenuUrl !== openableMenuUrl"), "PickScreen must not reconstruct openable URL from hydrated menu text");
assert(!pickScreen.includes("lastAnalyzedMenuUrl"), "PickScreen must not keep post-analyze URL state across sessions");
assert(pickScreen.includes("setOpenableMenuUrl(null);"), "PickScreen reset and non-URL flows must clear menu URL state");

assert(useAnalyzeMenu.includes("const [result, setResult] = useState<AnalyzeData | null>(null);"), "analyze hook must cold start without result");
assert(useAnalyzeMenu.includes("const [loading, setLoading] = useState(false);"), "analyze hook must cold start without loading");
assert(useAnalyzeMenu.includes('const [error, setError] = useState("");'), "analyze hook must cold start without error");
assert(useAnalyzeMenu.includes("const [currentRequestId, setCurrentRequestId] = useState<number | null>(null);"), "analyze hook must cold start without request id");
assert(useAnalyzeMenu.includes("const requestIdRef = useRef(0);"), "request generation must be in-memory only");
assert(useAnalyzeMenu.includes("const abortControllerRef = useRef<AbortController | null>(null);"), "abort controller must be in-memory only");

assert(recommendationCard.includes("const activeNestedDishIdRef = useRef<string | null>(null);"), "nested active dish ref must cold start empty");
assert(recommendationCard.includes("const [activeNestedDishId, setActiveNestedDishId] = useState<string | null>(null);"), "nested active dish state must cold start empty");
assert(recommendationCard.includes("const [nestedRecommendationsByDishId, setNestedRecommendationsByDishId] = useState<Record<string, NestedRecommendationState>>({});"), "nested recommendations must cold start empty");
assert(recommendationCard.includes("setNestedRecommendationsByDishId({});"), "nested recommendations must be reset when main result changes");

assert(rootNavigator.includes('const [activeTab, setActiveTab] = useState<RootTab>("home");'), "app bootstrap must not reopen directly into Pick");
assert(rootNavigator.includes("<PickScreen"), "PickScreen remains mounted only within the current app session");

const previousStorage = {
  "gustaroai:user-profile:v1": JSON.stringify({
    primaryLikes: ["Fisch"],
    customExclusions: ["Walnuesse"],
    allergens: ["Walnuesse"],
    outputLocale: "de"
  }),
  "gustaroai:pick-flow:v1": JSON.stringify({
    menuText: "https://example.test/old-menu.pdf",
    openableMenuUrl: "https://example.test/old-menu.pdf",
    result: { recommendations: [{ dishId: "old" }] },
    error: "old error",
    loading: true,
    recommendationMode: "starters_and_salads",
    activeNestedDishId: "old",
    nestedRecommendationsByDishId: { old: { status: "loading" } }
  }),
  "pickforme:last-menu-url": "https://example.test/legacy-menu.pdf"
};

function coldStartPickState(_storage) {
  return {
    menuText: "",
    menuInputOrigin: "empty",
    openableMenuUrl: null,
    result: null,
    error: "",
    loading: false,
    currentRequestId: null,
    recommendationMode: "main_course",
    activeNestedDishId: null,
    activeNestedDishIdRef: null,
    nestedRecommendationsByDishId: {},
    browserOpening: false
  };
}

function hydrateProfile(storage) {
  return JSON.parse(storage["gustaroai:user-profile:v1"]);
}

const coldStart = coldStartPickState(previousStorage);
assert(coldStart.menuText === "", "cold start must not restore menuText");
assert(coldStart.menuInputOrigin === "empty", "cold start must reset input origin");
assert(coldStart.openableMenuUrl === null, "cold start must not restore menu URL");
assert(coldStart.result === null, "cold start must not restore result");
assert(coldStart.error === "", "cold start must not restore error");
assert(coldStart.loading === false, "cold start must not restore loading");
assert(coldStart.currentRequestId === null, "cold start must not restore request id");
assert(coldStart.recommendationMode === "main_course", "cold start must restore regular role selection");
assert(coldStart.activeNestedDishId === null, "cold start must not restore nested active dish");
assert(coldStart.activeNestedDishIdRef === null, "cold start must not restore nested active ref");
assert(Object.keys(coldStart.nestedRecommendationsByDishId).length === 0, "cold start must not restore nested recommendations");
assert(coldStart.browserOpening === false, "cold start must not restore temporary browser guard");

const profile = hydrateProfile(previousStorage);
assert(profile.primaryLikes.includes("Fisch"), "profile likes must survive cold start");
assert(profile.customExclusions.includes("Walnuesse"), "profile exclusions must survive cold start");
assert(profile.allergens.includes("Walnuesse"), "profile allergens must survive cold start");
assert(profile.outputLocale === "de", "output locale must survive cold start");

function backgroundResume(state) {
  return { ...state };
}

const runningSession = {
  menuText: "https://example.test/current-menu.pdf",
  openableMenuUrl: "https://example.test/current-menu.pdf",
  loading: true,
  currentRequestId: 3,
  result: null,
  error: "",
  activeNestedDishId: "dish-1"
};
const resumed = backgroundResume(runningSession);
assert(resumed.menuText === runningSession.menuText, "background/resume must keep menuText");
assert(resumed.openableMenuUrl === runningSession.openableMenuUrl, "background/resume must keep menu URL");
assert(resumed.loading === true, "background/resume must keep loading state");
assert(resumed.currentRequestId === runningSession.currentRequestId, "background/resume must keep request id");
assert(resumed.activeNestedDishId === runningSession.activeNestedDishId, "background/resume must keep nested state");

function openInAppBrowser(state) {
  return {
    ...state,
    browserOpening: false,
    browserOpenCount: (state.browserOpenCount ?? 0) + 1
  };
}

const afterBrowser = openInAppBrowser({ ...runningSession, browserOpenCount: 0 });
assert(afterBrowser.menuText === runningSession.menuText, "in-app browser must not reset menuText");
assert(afterBrowser.loading === true, "in-app browser must not stop analysis");
assert(afterBrowser.currentRequestId === runningSession.currentRequestId, "in-app browser must not replace request id");
assert(afterBrowser.browserOpenCount === 1, "in-app browser must only open once in this simulation");

function firstRenderedPickState(storage) {
  return coldStartPickState(storage);
}

const firstRender = firstRenderedPickState(previousStorage);
assert(firstRender.menuText === "", "old link must not be visible on first render");
assert(firstRender.openableMenuUrl === null, "old menu URL must not be openable on first render");

console.log("pick-flow cold-start regression passed");
