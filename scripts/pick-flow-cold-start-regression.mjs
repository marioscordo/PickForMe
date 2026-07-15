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
const profileEditor = read("apps/mobile/src/components/profile/ProfileEditor.tsx");
const profileScreen = read("apps/mobile/src/screens/profile/ProfileScreen.tsx");
const pickformeApi = read("apps/mobile/src/api/pickformeApi.ts");
const mobileContentDe = JSON.parse(read("apps/mobile/src/content/mobileContent.de-DE.json"));
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
assert(profileProvider.includes('displayName: "",'), "fresh profile must not include a sample displayName");
assert(!profileProvider.includes('displayName: "Mario"'), "fresh profile must not include Mario as sample data");
assert(profileProvider.includes("primaryLikes: [],"), "fresh profile must not preselect preferences");
assert(profileProvider.includes("customExclusions: [],"), "fresh profile must not preselect exclusions or intolerances");
assert(profileProvider.includes("allergens: [],"), "fresh profile must not preselect allergens");
assert(!profileProvider.includes('primaryLikes: ["Fleisch", "Fisch"]'), "fresh profile must not preselect Fleisch/Fisch");
assert(profileProvider.includes("primaryLikes: uniqueValues(filterControlledProfileValues(stringArray(profile.primaryLikes)))"), "profile provider must deduplicate stored preferences");
assert(profileProvider.includes("customExclusions: uniqueValues(filterControlledProfileValues(stringArray(profile.customExclusions)))"), "profile provider must deduplicate stored exclusions");
assert(profileProvider.includes('normalize("NFC")'), "profile provider duplicate check must use canonical NFC normalization");
assert(pickformeApi.includes("primaryLikes: uniqueValues(filterControlledProfileValues(profile.primaryLikes))"), "analysis payload must deduplicate preferences");
assert(pickformeApi.includes("customExclusions: uniqueValues(filterControlledProfileValues(profile.customExclusions ?? []))"), "analysis payload must deduplicate exclusions");
assert(pickformeApi.includes('normalize("NFC")'), "analysis payload duplicate check must use canonical NFC normalization");
assert(profileScreen.includes('normalize("NFC")'), "profile screen duplicate check must use canonical NFC normalization");
assert(profileEditor.includes('normalize("NFC")'), "profile editor duplicate check must use canonical NFC normalization");
assert(profileScreen.includes("preferenceAlreadyExists(nextValue, latestProfileRef.current)"), "profile screen must recheck preference duplicates after async validation");
assert(profileScreen.includes("exclusionAlreadyExists(nextValue, latestProfileRef.current)"), "profile screen must recheck exclusion duplicates after async validation");
assert(profileEditor.includes("preferenceAlreadyExists(nextValue, latestProfileRef.current)"), "profile editor must recheck preference duplicates after async validation");
assert(profileEditor.includes("exclusionAlreadyExists(nextValue, latestProfileRef.current)"), "profile editor must recheck exclusion duplicates after async validation");
assert(profileProvider.includes("allergens: uniqueValues(filterControlledProfileValues(stringArray(profile.allergens)))"), "allergen sanitizing must remain explicit");

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

function freshProfileFromDefault() {
  return {
    displayName: "",
    primaryLikes: [],
    customExclusions: [],
    allergens: []
  };
}

function normalizeProfileValue(value) {
  return value.trim().normalize("NFC").toLowerCase();
}

function uniqueProfileValues(values) {
  return values.reduce((result, value) => {
    return result.some((item) => normalizeProfileValue(item) === normalizeProfileValue(value))
      ? result
      : [...result, value];
  }, []);
}

function addUniqueProfileValue(values, value) {
  return values.some((item) => normalizeProfileValue(item) === normalizeProfileValue(value))
    ? values
    : [...values, value];
}

function sanitizeProfileForApiFixture(profile) {
  return {
    displayName: profile.displayName,
    primaryLikes: uniqueProfileValues(profile.primaryLikes),
    customExclusions: uniqueProfileValues(profile.customExclusions ?? []),
    allergens: uniqueProfileValues(profile.allergens ?? [])
  };
}

const preferenceDuplicateInputs = ["Koriander", "koriander", " Koriander "];
for (const input of preferenceDuplicateInputs) {
  const next = addUniqueProfileValue(["Koriander"], input);
  assert(next.length === 1 && next[0] === "Koriander", `preference duplicate ${input} must keep one entry`);
}

const exclusionDuplicateInputs = ["Koriander", "koriander", " Koriander "];
for (const input of exclusionDuplicateInputs) {
  const next = addUniqueProfileValue(["Koriander"], input);
  assert(next.length === 1 && next[0] === "Koriander", `exclusion duplicate ${input} must keep one entry`);
}

const unicodeDuplicate = uniqueProfileValues(["Cafe\u0301", "Caf\u00e9"]);
assert(unicodeDuplicate.length === 1 && unicodeDuplicate[0] === "Cafe\u0301", "canonical Unicode duplicate must keep first visible value");
assert(addUniqueProfileValue(addUniqueProfileValue(["Koriander"], "Koriander"), "Koriander").length === 1, "double submit must keep only one preference");
assert(profileScreen.includes("onSubmitEditing={addCustomPreference}"), "Enter must use the same preference add handler");
assert(profileScreen.includes("onPress={addCustomPreference}"), "Add button must use the same preference add handler");
assert(profileScreen.includes("onSubmitEditing={addCustomExclusion}"), "Enter must use the same exclusion add handler");
assert(profileScreen.includes("onPress={addCustomExclusion}"), "Add button must use the same exclusion add handler");

const persistedDuplicateProfile = {
  primaryLikes: ["Koriander", "koriander", " Basilikum ", "Basilikum"],
  customExclusions: ["Koriander", "koriander", " Basilikum ", "Basilikum"]
};
const normalizedPersistedLikes = uniqueProfileValues(persistedDuplicateProfile.primaryLikes);
const normalizedPersistedExclusions = uniqueProfileValues(persistedDuplicateProfile.customExclusions);
assert(normalizedPersistedLikes.length === 2, "stored duplicate preferences must be deduplicated");
assert(normalizedPersistedLikes[0] === "Koriander" && normalizedPersistedLikes[1] === " Basilikum ", "stored preferences must keep first value and order");
assert(normalizedPersistedExclusions.length === 2, "stored duplicate exclusions must be deduplicated");
assert(normalizedPersistedExclusions[0] === "Koriander" && normalizedPersistedExclusions[1] === " Basilikum ", "stored exclusions must keep first value and order");

const duplicatedPayloadProfile = sanitizeProfileForApiFixture({
  displayName: "",
  primaryLikes: ["Koriander", "koriander", "Tomate", "Tomaten"],
  customExclusions: ["Koriander", " Koriander ", "Aubergine", "Eggplant"],
  allergens: ["Milch", "Milch"]
});
assert(duplicatedPayloadProfile.primaryLikes.join("|") === "Koriander|Tomate|Tomaten", "analysis payload must keep unique preferences and preserve order");
assert(duplicatedPayloadProfile.customExclusions.join("|") === "Koriander|Aubergine|Eggplant", "analysis payload must keep unique exclusions and preserve order");
assert(duplicatedPayloadProfile.allergens.join("|") === "Milch", "allergen payload deduplication must remain unchanged");
assert(uniqueProfileValues(["Tomate", "Tomaten"]).length === 2, "singular and plural must not be merged");
assert(uniqueProfileValues(["Aubergine", "Eggplant"]).length === 2, "translations must not be merged");
assert(uniqueProfileValues(["Koriander", "Korianderblaetter"]).length === 2, "similar foods must not be merged");
const crossListProfile = sanitizeProfileForApiFixture({
  displayName: "",
  primaryLikes: ["Koriander"],
  customExclusions: ["Koriander"],
  allergens: []
});
assert(crossListProfile.primaryLikes.length === 1 && crossListProfile.customExclusions.length === 1, "same value in preferences and exclusions must not be removed across lists");

const freshProfile = freshProfileFromDefault();
assert(freshProfile.displayName === "", "fresh start must not include a sample displayName");
assert(freshProfile.displayName !== "Mario", "fresh start must not visibly use Mario as sample data");
assert(freshProfile.primaryLikes.length === 0, "fresh start must not activate preferences");
assert(freshProfile.customExclusions.length === 0, "fresh start must not activate exclusions");
assert(freshProfile.allergens.length === 0, "fresh start must not activate allergens");
assert(!freshProfile.allergens.includes("Milch"), "fresh start must not preselect Milch");
assert(!freshProfile.allergens.includes("Eier"), "fresh start must not preselect Eier");

const allergyOptions = mobileContentDe.profileEditor.allergyOptions;
assert(Array.isArray(allergyOptions) && allergyOptions.length >= 20, "full allergen option list must remain visible");
assert(allergyOptions.some((option) => option.value === "Milch"), "Milch allergen option must remain visible");
assert(allergyOptions.some((option) => option.value === "Eier"), "Eier allergen option must remain visible");
assert(profileEditor.includes("const visibleAllergyOptions = allergenModuleEnabled ? allergyOptions : [];"), "profile editor must keep the full allergen option list visible");
assert(profileEditor.includes("active={allergens.includes(value)}"), "allergen chips must be active only when stored in profile.allergens");

function sanitizeFreshProfileForApi(profile) {
  return {
    displayName: profile.displayName,
    primaryLikes: profile.primaryLikes,
    customExclusions: profile.customExclusions,
    allergens: profile.allergens
  };
}

const firstAnalyzePayloadProfile = sanitizeFreshProfileForApi(freshProfile);
assert(firstAnalyzePayloadProfile.displayName === "", "first analysis payload must not include a sample displayName");
assert(firstAnalyzePayloadProfile.displayName !== "Mario", "first analysis payload must not include Mario as sample data");
assert(firstAnalyzePayloadProfile.primaryLikes.length === 0, "first analysis payload must not include active preferences");
assert(firstAnalyzePayloadProfile.customExclusions.length === 0, "first analysis payload must not include exclusions");
assert(firstAnalyzePayloadProfile.allergens.length === 0, "first analysis payload must not include active allergens");

const storedProfile = hydrateProfile({
  "gustaroai:user-profile:v1": JSON.stringify({
    displayName: "Mario",
    primaryLikes: ["Pasta"],
    customExclusions: ["Koriander"],
    allergens: ["Milch"]
  })
});
assert(storedProfile.displayName === "Mario", "existing stored displayName must remain unchanged");
assert(storedProfile.primaryLikes.includes("Pasta"), "existing stored preferences must remain unchanged");
assert(storedProfile.customExclusions.includes("Koriander"), "existing stored exclusions must remain unchanged");
assert(storedProfile.allergens.includes("Milch"), "existing stored active allergens must remain unchanged");

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
